alter table public.game_sessions
  add column if not exists review_version integer,
  add column if not exists review_snapshot jsonb,
  add column if not exists player_count integer check (player_count is null or player_count between 5 and 10),
  add column if not exists human_seat integer check (human_seat is null or human_seat >= 0),
  add column if not exists winner text check (winner is null or winner in ('GOOD', 'EVIL')),
  add column if not exists win_reason text check (
    win_reason is null or win_reason in (
      'ASSASSINATION_MISS',
      'THREE_MISSIONS',
      'ASSASSINATION_HIT',
      'REJECT_LIMIT'
    )
  ),
  add column if not exists good_score integer check (good_score is null or good_score >= 0),
  add column if not exists evil_score integer check (evil_score is null or evil_score >= 0);

create index if not exists game_sessions_user_ended_idx
  on public.game_sessions(user_id, ended_at desc)
  where status = 'ended' and review_snapshot is not null;
