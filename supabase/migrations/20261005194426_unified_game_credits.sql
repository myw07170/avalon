begin;

alter table public.user_credits
  add column games_remaining integer not null default 1
  check (games_remaining >= 0);

update public.user_credits
set games_remaining = free_games_remaining + purchased_games_remaining;

alter table public.user_credits
  drop column free_games_remaining,
  drop column purchased_games_remaining;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

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

  insert into public.user_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_credits
  set games_remaining = games_remaining - 1
  where user_id = p_user_id
    and games_remaining > 0;

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

  insert into public.user_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.game_sessions (user_id, ai_call_limit, llm_source)
  values (p_user_id, p_ai_call_limit, 'user')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.start_game_session(uuid, integer) from public, anon, authenticated;
revoke all on function public.start_user_llm_game_session(uuid, integer) from public, anon, authenticated;

grant execute on function public.start_game_session(uuid, integer) to service_role;
grant execute on function public.start_user_llm_game_session(uuid, integer) to service_role;

notify pgrst, 'reload schema';

commit;
