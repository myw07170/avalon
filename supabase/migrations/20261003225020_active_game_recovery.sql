-- Only authenticated Next.js routes use these tables/functions via service_role.
create table public.active_games (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_id uuid not null unique,
  game_session_id uuid references public.game_sessions(id),
  snapshot jsonb not null,
  revision bigint not null default 0,
  epoch bigint not null default 1,
  writer_id uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.game_start_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  outcome text,
  primary key (user_id, request_id)
);
alter table public.active_games enable row level security;
alter table public.game_start_requests enable row level security;
revoke all on public.active_games, public.game_start_requests from public, anon, authenticated;
grant all on public.active_games, public.game_start_requests to service_role;

-- Serialize per account, including the absence of a row during create/delete.
-- SECURITY INVOKER: this RPC is executable only by the backend service role.
create function public.active_game_command(p_user_id uuid, p_operation text, p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.active_games;
  s jsonb;
  v_session uuid;
  v_game uuid;
  v_writer uuid;
  v_revision bigint;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into g from public.active_games where user_id = p_user_id for update;
  if p_operation = 'start' then
    s := p_payload->'snapshot';
    v_game := (s->>'gameId')::uuid;
    v_writer := (p_payload->>'writerId')::uuid;
    if exists(select 1 from public.game_start_requests where user_id = p_user_id and request_id = v_game) then
      if g.game_id is distinct from v_game then raise exception 'GAME_GONE'; end if;
      if g.writer_id is distinct from v_writer then raise exception 'GAME_CONFLICT'; end if;
    else
      if g.user_id is not null then raise exception 'GAME_EXISTS'; end if;
      if s->>'aiMode' = 'remote' then
        if s->'model' <> 'null'::jsonb then
          v_session := public.start_user_llm_game_session(p_user_id, (p_payload->>'aiCallLimit')::integer);
        else
          v_session := public.start_game_session(p_user_id, (p_payload->>'aiCallLimit')::integer);
        end if;
      end if;
      s := jsonb_set(s, '{gameSessionId}', coalesce(to_jsonb(v_session), 'null'::jsonb));
      insert into public.game_start_requests(user_id, request_id) values (p_user_id, v_game);
      insert into public.active_games(user_id, game_id, game_session_id, snapshot, writer_id, lease_expires_at)
      values(p_user_id, v_game, v_session, s, v_writer, now() + interval '45 seconds') returning * into g;
    end if;
  elsif p_operation = 'read' then
    if g.user_id is null then return 'null'::jsonb; end if;
  else
    if p_operation = 'finish' and exists(select 1 from public.game_start_requests where user_id = p_user_id and request_id = (p_payload->>'gameId')::uuid and outcome = 'finished') then return '{}'::jsonb; end if;
    if g.user_id is null or g.game_id <> (p_payload->>'gameId')::uuid then raise exception 'GAME_GONE'; end if;
    v_writer := (p_payload->>'writerId')::uuid;
    if p_operation = 'resume' then
      if g.writer_id is not null and g.writer_id <> v_writer and g.lease_expires_at > now() and not coalesce((p_payload->>'takeover')::boolean, false) then
        raise exception 'GAME_OCCUPIED';
      end if;
      -- A local unacknowledged write can only belong to this exact generation.
      if (p_payload->'backup'->'handle'->>'epoch')::bigint = g.epoch
         and (p_payload->'backup'->'handle'->>'revision')::bigint > g.revision
         and (p_payload->'backup'->'snapshot'->>'gameId')::uuid = g.game_id
         and (p_payload->'backup'->'snapshot'->>'gameSessionId')::uuid is not distinct from g.game_session_id then
        g.snapshot := p_payload->'backup'->'snapshot';
        g.revision := (p_payload->'backup'->'handle'->>'revision')::bigint;
      end if;
      update public.active_games set snapshot = g.snapshot, revision = g.revision, epoch = epoch + 1,
        writer_id = v_writer, lease_expires_at = now() + interval '45 seconds'
        where user_id = p_user_id returning * into g;
    else
      -- Abandon from the lobby uses the observed epoch and requires explicit takeover if occupied.
      if p_operation = 'abandon' and coalesce((p_payload->>'takeover')::boolean, false) then
        null;
      elsif g.writer_id is distinct from v_writer or g.epoch <> (p_payload->>'epoch')::bigint or g.lease_expires_at <= now() then
        raise exception 'GAME_CONFLICT';
      end if;
      if p_operation = 'save' then
        v_revision := (p_payload->>'revision')::bigint;
        s := p_payload->'snapshot';
        if v_revision < g.revision or (v_revision = g.revision and s <> g.snapshot) then raise exception 'GAME_CONFLICT'; end if;
        if (s->>'gameId')::uuid <> g.game_id or (s->>'gameSessionId')::uuid is distinct from g.game_session_id then raise exception 'GAME_CONFLICT'; end if;
        update public.active_games set snapshot = s, revision = v_revision, updated_at = now(), lease_expires_at = now() + interval '45 seconds'
          where user_id = p_user_id returning * into g;
      elsif p_operation = 'heartbeat' then
        update public.active_games set lease_expires_at = now() + interval '45 seconds' where user_id = p_user_id returning * into g;
      elsif p_operation = 'authorize_ai' then
        if g.game_session_id is null or g.game_session_id <> (p_payload->>'sessionId')::uuid then raise exception 'GAME_CONFLICT'; end if;
        if p_payload->>'source' = 'user' then
          perform public.record_ai_call(p_user_id, g.game_session_id);
        else
          perform public.consume_ai_call(p_user_id, g.game_session_id);
        end if;
        return '{}'::jsonb;
      elsif p_operation = 'release' then
        update public.active_games set writer_id = null, lease_expires_at = null where user_id = p_user_id;
        return '{}'::jsonb;
      elsif p_operation = 'abandon' then
        update public.game_sessions set status = 'ended', ended_at = now() where id = g.game_session_id and user_id = p_user_id and status = 'active';
        delete from public.active_games where user_id = p_user_id;
        update public.game_start_requests set outcome = 'abandoned' where user_id = p_user_id and request_id = g.game_id;
        return '{}'::jsonb;
      elsif p_operation = 'finish' then
        if g.snapshot->'checkpoint'->'state'->>'phase' <> 'GAME_OVER' then raise exception 'GAME_CONFLICT'; end if;
        s := p_payload->'review';
        if g.game_session_id is not null then
          update public.game_sessions set status = 'ended', ended_at = now(),
            review_version = (s->>'schemaVersion')::integer, review_snapshot = s,
            player_count = (s->'summary'->>'playerCount')::integer, human_seat = (s->'summary'->>'humanSeat')::integer,
            winner = s->'summary'->>'winner', win_reason = s->'summary'->>'winReason',
            good_score = (s->'summary'->>'goodScore')::integer, evil_score = (s->'summary'->>'evilScore')::integer
            where id = g.game_session_id and user_id = p_user_id;
        end if;
        delete from public.active_games where user_id = p_user_id;
        update public.game_start_requests set outcome = 'finished' where user_id = p_user_id and request_id = g.game_id;
        return '{}'::jsonb;
      elsif p_operation <> 'verify' then
        raise exception 'BAD_REQUEST';
      end if;
    end if;
  end if;
  return jsonb_build_object('snapshot', g.snapshot, 'handle', jsonb_build_object(
    'gameId', g.game_id, 'writerId', g.writer_id, 'epoch', g.epoch, 'revision', g.revision),
    'occupied', g.writer_id is not null and g.lease_expires_at > now());
end;
$$;
revoke all on function public.active_game_command(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.active_game_command(uuid, text, jsonb) to service_role;
notify pgrst, 'reload schema';
