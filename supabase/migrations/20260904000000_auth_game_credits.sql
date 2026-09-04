create schema if not exists private;

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_games_remaining integer not null default 1 check (free_games_remaining >= 0),
  purchased_games_remaining integer not null default 0 check (purchased_games_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  ai_calls_used integer not null default 0 check (ai_calls_used >= 0),
  ai_call_limit integer not null check (ai_call_limit > 0),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists game_sessions_user_created_idx
  on public.game_sessions(user_id, created_at desc);

alter table public.user_credits enable row level security;
alter table public.game_sessions enable row level security;

revoke all on table public.user_credits from public, anon, authenticated;
revoke all on table public.game_sessions from public, anon, authenticated;

grant select on table public.user_credits to authenticated;

drop policy if exists "Users can read their own credits" on public.user_credits;
create policy "Users can read their own credits"
  on public.user_credits
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_credits_set_updated_at on public.user_credits;
create trigger user_credits_set_updated_at
  before update on public.user_credits
  for each row
  execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id, free_games_remaining)
  values (new.id, 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

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

  insert into public.game_sessions (user_id, ai_call_limit)
  values (p_user_id, p_ai_call_limit)
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
    and ai_calls_used < ai_call_limit
  returning ai_calls_used into v_calls_used;

  if found then
    return v_calls_used;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
    and user_id = p_user_id;

  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'GAME_SESSION_CLOSED';
  end if;

  raise exception 'AI_CALL_LIMIT_REACHED';
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.start_game_session(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_ai_call(uuid, uuid) from public, anon, authenticated;

grant execute on function public.start_game_session(uuid, integer) to service_role;
grant execute on function public.consume_ai_call(uuid, uuid) to service_role;
