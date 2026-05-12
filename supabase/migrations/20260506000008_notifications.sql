-- ============================================================================
-- In-app notifications (foundation for future web-push)
-- ============================================================================
-- Schema is intentionally vanilla so the same rows can later be fanned out
-- to web-push subscriptions, email digests, etc., without changing how
-- triggers and the bell UI write/read them.
-- ============================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_id    uuid references public.games(id) on delete cascade,
  type       text not null check (type in (
    'submission_approved',
    'submission_rejected',
    'mission_unlocked',
    'mission_expired',
    'new_submission'
  )),
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notif_user_unread
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index idx_notif_user_recent
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

-- A user can only see and acknowledge their own notifications. Inserts
-- come exclusively from SECURITY DEFINER triggers below, so there's no
-- INSERT policy by design.
create policy "notif_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "notif_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Trigger: team_mission_state changes -> notify the team.
--
-- Only fires on UPDATE transitions (not initial INSERTs) so that:
--   * a new team being created mid-game doesn't spam them with "unlocked"
--     for every always-available mission, and
--   * adding a new mission to a running game doesn't notify retroactively.
-- ----------------------------------------------------------------------------
create or replace function public.on_tms_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_join_code text;
  v_game_id   uuid;
  v_title     text;
begin
  select g.id, g.join_code, m.title
    into v_game_id, v_join_code, v_title
  from public.teams t
  join public.games g on g.id = t.game_id
  join public.missions m on m.id = new.mission_id
  where t.id = new.team_id;

  -- Locked -> Unlocked: a real "you can play this now" event.
  if tg_op = 'UPDATE'
     and new.state = 'unlocked'
     and old.state = 'locked' then
    insert into public.notifications (user_id, game_id, type, title, href)
    select
      tm.user_id,
      v_game_id,
      'mission_unlocked',
      'Mission unlocked: ' || v_title,
      '/play/' || v_join_code
    from public.team_members tm
    where tm.team_id = new.team_id;
  end if;

  -- Unlocked -> failed_expired: deadline passed without an approval.
  if tg_op = 'UPDATE'
     and new.state = 'failed_expired'
     and old.state <> 'failed_expired' then
    insert into public.notifications (user_id, game_id, type, title, body, href)
    select
      tm.user_id,
      v_game_id,
      'mission_expired',
      'Time''s up: ' || v_title,
      'The deadline passed before your team submitted.',
      '/play/' || v_join_code
    from public.team_members tm
    where tm.team_id = new.team_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_tms_change on public.team_mission_state;
create trigger on_tms_change
  after update on public.team_mission_state
  for each row execute procedure public.on_tms_change();

-- ----------------------------------------------------------------------------
-- Trigger: submission changes -> notify GM (new pending) or team
-- (approved / rejected).
-- ----------------------------------------------------------------------------
create or replace function public.on_submission_notify()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_game_id    uuid;
  v_owner_id   uuid;
  v_join_code  text;
  v_mission    text;
  v_team_name  text;
begin
  select g.id, g.owner_id, g.join_code, m.title
    into v_game_id, v_owner_id, v_join_code, v_mission
  from public.missions m
  join public.games g on g.id = m.game_id
  where m.id = new.mission_id;

  select name into v_team_name from public.teams where id = new.team_id;

  -- New pending submission -> notify the GM
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, game_id, type, title, body, href)
    values (
      v_owner_id,
      v_game_id,
      'new_submission',
      coalesce(v_team_name, 'A team') || ' submitted: ' || v_mission,
      null,
      '/games/' || v_game_id || '/review?tab=pending'
    );
  end if;

  -- Approval -> notify all team members
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.notifications (user_id, game_id, type, title, body, href)
    select
      tm.user_id,
      v_game_id,
      'submission_approved',
      '✓ Approved: ' || v_mission,
      case
        when new.bonus_points > 0
          then 'Awarded ' || new.bonus_points::text || ' bonus pts'
        else null
      end,
      '/play/' || v_join_code
    from public.team_members tm
    where tm.team_id = new.team_id;
  end if;

  -- Rejection -> notify all team members (carry feedback if any)
  if new.status = 'rejected'
     and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    insert into public.notifications (user_id, game_id, type, title, body, href)
    select
      tm.user_id,
      v_game_id,
      'submission_rejected',
      'Try again: ' || v_mission,
      new.feedback,
      '/play/' || v_join_code
    from public.team_members tm
    where tm.team_id = new.team_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_submission_notify on public.submissions;
create trigger on_submission_notify
  after insert or update of status on public.submissions
  for each row execute procedure public.on_submission_notify();

-- ----------------------------------------------------------------------------
-- Realtime publication (idempotent guard against re-runs).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
