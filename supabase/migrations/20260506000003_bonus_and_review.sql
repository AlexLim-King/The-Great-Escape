-- ============================================================================
-- GM bonus points + richer review section support
-- ============================================================================
-- * bonus_points lives on submissions (the canonical record) and is mirrored
--   to team_mission_state on approval so the leaderboard stays a fast read.
-- * Bonus is only meaningful for an approved submission. When status changes
--   away from approved, we reset the mirrored bonus to 0.
-- ============================================================================

-- 1. Bonus columns
alter table public.submissions
  add column bonus_points int not null default 0
  check (bonus_points >= 0);

alter table public.team_mission_state
  add column bonus_points int not null default 0
  check (bonus_points >= 0);

-- 2. Status-change trigger now also mirrors bonus on approve / clears on
--    transition out of approved.
create or replace function public.on_submission_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update public.team_mission_state
       set state = 'approved',
           completed_at = now(),
           bonus_points = coalesce(new.bonus_points, 0)
     where team_id = new.team_id
       and mission_id = new.mission_id
       and state <> 'failed_expired';
    perform public.recompute_team_mission_state(new.team_id);

  elsif new.status = 'rejected'
        and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    update public.team_mission_state
       set state = 'unlocked',
           bonus_points = 0,
           completed_at = null
     where team_id = new.team_id
       and mission_id = new.mission_id
       and state not in ('failed_expired');

  elsif new.status = 'pending'
        and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    update public.team_mission_state
       set state = 'submitted'
     where team_id = new.team_id
       and mission_id = new.mission_id
       and state not in ('approved','failed_expired');
  end if;
  return new;
end;
$$;

-- 3. Separate trigger for retroactive bonus edits (status stays 'approved'
--    but the GM tweaks bonus_points). UPDATE OF only fires when that column
--    actually changes.
create or replace function public.on_submission_bonus_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.bonus_points is distinct from old.bonus_points then
    update public.team_mission_state
       set bonus_points = coalesce(new.bonus_points, 0)
     where team_id = new.team_id
       and mission_id = new.mission_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_submission_bonus_change on public.submissions;
create trigger on_submission_bonus_change
  after update of bonus_points on public.submissions
  for each row execute procedure public.on_submission_bonus_change();

-- 4. Leaderboard now sums (mission base points + tms.bonus_points) for
--    every approved row.
create or replace function public.game_leaderboard(p_game_id uuid)
returns table(
  team_id   uuid,
  team_name text,
  color     text,
  score     int,
  completed int
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.owner_id = auth.uid()
  ) and not exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid() and t.game_id = p_game_id
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select
      t.id,
      t.name,
      t.color,
      coalesce(sum(m.points + tms.bonus_points)
               filter (where tms.state = 'approved'), 0)::int,
      count(*) filter (where tms.state = 'approved')::int
    from public.teams t
    left join public.team_mission_state tms on tms.team_id = t.id
    left join public.missions m            on m.id = tms.mission_id
    where t.game_id = p_game_id
    group by t.id, t.name, t.color, t.created_at
    order by 4 desc, t.created_at asc;
end;
$$;
