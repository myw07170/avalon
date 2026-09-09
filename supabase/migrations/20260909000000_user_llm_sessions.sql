alter table public.game_sessions
  add column if not exists llm_source text not null default 'platform'
  check (llm_source in ('platform', 'user'));

create or replace function public.start_game_session(
  p_user_id uuid,
  p_ai_call_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_ai_call_limit is null or p_ai_call_limit < 1 or p_ai_call_limit > 1000 then
    raise exception 'AI_CALL_LIMIT_INVALID';
  end if;

  insert into public.user_credits (user_id, free_games_remaining)
  values (p_user_id, 1)
  on conflict (user_id) do nothing;

  update public.user_credits
  set free_games_remaining = free_games_remaining - 1
  where user_id = p_user_id
    and free_games_remaining > 0;

  if not found then
    update public.user_credits
    set purchased_games_remaining = purchased_games_remaining - 1
    where user_id = p_user_id
      and purchased_games_remaining > 0;
  end if;

  if not found then
    raise exception 'NO_GAME_CREDITS';
  end if;

  insert into public.game_sessions (user_id, ai_call_limit, llm_source)
  values (p_user_id, p_ai_call_limit, 'platform')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.start_user_llm_game_session(
  p_user_id uuid,
  p_ai_call_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_ai_call_limit is null or p_ai_call_limit < 1 or p_ai_call_limit > 1000 then
    raise exception 'AI_CALL_LIMIT_INVALID';
  end if;

  insert into public.user_credits (user_id, free_games_remaining)
  values (p_user_id, 1)
  on conflict (user_id) do nothing;

  insert into public.game_sessions (user_id, ai_call_limit, llm_source)
  values (p_user_id, p_ai_call_limit, 'user')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.consume_ai_call(
  p_user_id uuid,
  p_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls_used integer;
  v_session public.game_sessions%rowtype;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  update public.game_sessions
  set ai_calls_used = ai_calls_used + 1
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active'
    and llm_source = 'platform'
    and ai_calls_used < ai_call_limit
  returning ai_calls_used into v_calls_used;

  if found then
    return v_calls_used;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
    and user_id = p_user_id;

  if not found or v_session.llm_source <> 'platform' then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'GAME_SESSION_CLOSED';
  end if;

  raise exception 'AI_CALL_LIMIT_REACHED';
end;
$$;

create or replace function public.record_ai_call(
  p_user_id uuid,
  p_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls_used integer;
  v_session public.game_sessions%rowtype;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  update public.game_sessions
  set ai_calls_used = ai_calls_used + 1
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active'
    and llm_source = 'user'
    and ai_calls_used < ai_call_limit
  returning ai_calls_used into v_calls_used;

  if found then
    return v_calls_used;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
    and user_id = p_user_id;

  if not found or v_session.llm_source <> 'user' then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'GAME_SESSION_CLOSED';
  end if;

  raise exception 'AI_CALL_LIMIT_REACHED';
end;
$$;

revoke all on function public.start_user_llm_game_session(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_ai_call(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_ai_call(uuid, uuid) from public, anon, authenticated;

grant execute on function public.start_user_llm_game_session(uuid, integer) to service_role;
grant execute on function public.consume_ai_call(uuid, uuid) to service_role;
grant execute on function public.record_ai_call(uuid, uuid) to service_role;
