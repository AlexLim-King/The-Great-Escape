-- ============================================================================
-- Phase 2 — Time-sensitive missions (deadlines + auto-fail)
-- ============================================================================
-- Adds three deadline modes:
--   * 'absolute'                  — must complete by a fixed wall-clock time
--   * 'relative_to_unlock'        — must complete within N seconds of *this
--                                   team* unlocking the mission (per-team timer)
--   * 'relative_to_game_start'    — must complete within N seconds of the
--                                   game's start time (or game.created_at if
--                                   starts_at is null)
-- When a deadline passes without an approved submission the team_mission_state
-- transitions to 'failed_expired' (terminal). Linear-prereq downstream
-- missions stay locked because the unlock check requires 'approved'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mission columns
-- ----------------------------------------------------------------------------
alter table public.missions
  add column deadline_mode         text
    check (deadline_mode in ('absolute','relative_to_unlock','relative_to_game_start')),
  add column deadline_at           timestamptz,
  add column deadline_duration_sec integer;

alter table public.missions
  add constraint missions_deadline_consistent check (
    deadline_mode is null
    or (deadline_mode = 'absolute'
        and deadline_at is not null)
    or (deadline_mode in ('relative_to_unlock','relative_to_game_start')
        and deadline_duration_sec is not null and deadline_duration_sec > 0)
  );

-- ----------------------------------------------------------------------------
-- 2. team_mission_state: expires_at + failed_expired state
-- ----------------------------------------------------------------------------
alter table public.team_mission_state
  add column expires_at timestamptz;

alter table public.team_mission_state
  drop constraint team_mission_state_state_check;

alter table public.team_mission_state
  add constraint team_mission_state_state_check check (
    state in ('locked','unlocked','submitted','approved','rejected','failed_expired')
  );

create index idx_tms_expires on public.team_mission_state(expires_at)
  where state = 'unlocked' and expires_at is not null;

-- ----------------------------------------------------------------------------
-- 3. Recompute function — now also computes expires_at on the locked→unlocked
--    transition (and preserves it once set).
-- ----------------------------------------------------------------------------
create or replace function public.recompute_team_mission_state(p_team_id uuid)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_game_id    uuid;
  v_game_start timestamptz;
begin
  select t.game_id, coalesce(g.starts_at, g.created_at)
    into v_game_id, v_game_start
  from public.teams t
  join public.games g on g.id = t.game_id
  where t.id = p_team_id;

  if v_game_id is null then return; end if;

  -- Compute desired (state, expires_at) per mission for this team
  with desired as (
    select
      m.id as mission_id,
      m.deadline_mode,
      m.deadline_at,
      m.deadline_duration_sec,
      case
        when m.prerequisite_mission_id is null then 'unlocked'
        when exists (
          select 1 from public.team_mission_state tms
          where tms.team_id = p_team_id
            and tms.mission_id = m.prerequisite_mission_id
            and tms.state = 'approved'
        ) then 'unlocked'
        else 'locked'
      end as new_state
    from public.missions m
    where m.game_id = v_game_id
  )
  insert into public.team_mission_state (team_id, mission_id, state, expires_at)
  select
    p_team_id,
    d.mission_id,
    d.new_state,
    case
      when d.new_state = 'unlocked' and d.deadline_mode is not null then
        case d.deadline_mode
          when 'absolute'                then d.deadline_at
          when 'relative_to_unlock'      then now() + (d.deadline_duration_sec || ' seconds')::interval
          when 'relative_to_game_start'  then v_game_start + (d.deadline_duration_sec || ' seconds')::interval
        end
      else null
    end
  from desired d
  on conflict (team_id, mission_id) do update
  set
    state = case
      -- Terminal / pending states are sticky
      when public.team_mission_state.state in ('approved','submitted','failed_expired')
        then public.team_mission_state.state
      else excluded.state
    end,
    expires_at = case
      -- Once set, never overwrite (preserves the original window)
      when public.team_mission_state.expires_at is not null
        then public.team_mission_state.expires_at
      else excluded.expires_at
    end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Lazy expiry function — call before reading state to flip overdue rows.
-- ----------------------------------------------------------------------------
create or replace function public.expire_overdue_missions_for_team(p_team_id uuid)
returns int
language plpgsql security definer
set search_path = public as $$
declare
  v_count int;
begin
  with updated as (
    update public.team_mission_state
       set state = 'failed_expired'
     where team_id = p_team_id
       and state = 'unlocked'
       and expires_at is not null
       and expires_at <= now()
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- Game-wide variant (e.g. for the GM dashboard or a future cron job)
create or replace function public.expire_overdue_missions_for_game(p_game_id uuid)
returns int
language plpgsql security definer
set search_path = public as $$
declare
  v_count int;
begin
  with updated as (
    update public.team_mission_state tms
       set state = 'failed_expired'
      from public.teams t
     where tms.team_id = t.id
       and t.game_id = p_game_id
       and tms.state = 'unlocked'
       and tms.expires_at is not null
       and tms.expires_at <= now()
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Submission status trigger — never override 'failed_expired' (defensive).
-- ----------------------------------------------------------------------------
create or replace function public.on_submission_status_change()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update public.team_mission_state
       set state = 'approved', completed_at = now()
     where team_id = new.team_id and mission_id = new.mission_id
       and state <> 'failed_expired';
    perform public.recompute_team_mission_state(new.team_id);

  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    update public.team_mission_state
       set state = 'unlocked'
     where team_id = new.team_id and mission_id = new.mission_id
       and state not in ('approved','failed_expired');

  elsif new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    update public.team_mission_state
       set state = 'submitted'
     where team_id = new.team_id and mission_id = new.mission_id
       and state not in ('approved','failed_expired');
  end if;
  return new;
end;
$$;
