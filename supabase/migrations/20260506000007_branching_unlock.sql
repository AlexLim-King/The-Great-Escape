-- ============================================================================
-- Branching boolean unlock expressions + time gates
-- ============================================================================
-- Replaces the single `prerequisite_mission_id` with a flexible model that
-- still maps to a clean UI:
--
--   unlock_groups  jsonb  array of arrays of mission UUIDs (as text).
--                         Each inner array is an "AND" group; the mission
--                         unlocks when ANY group is satisfied (every id in
--                         that group is 'approved' for the team).
--                         Empty outer array = always available.
--   unlock_after   timestamptz  optional time gate; mission cannot unlock
--                               before this wall-clock time.
--
-- Examples:
--   []                                 -> always available
--   [["M1"]]                           -> requires M1 (same as before)
--   [["M1","M2"]]                      -> requires M1 AND M2
--   [["M1"],["M2"]]                    -> requires M1 OR M2
--   [["M1","M2"],["M3"]]               -> (M1 AND M2) OR M3
--   [] + unlock_after = '14:00 today'  -> available at 14:00 sharp
--
-- This is disjunctive normal form (DNF) — any boolean unlock expression
-- can be flattened to this shape. The PRD's examples in §5.3 all map.
-- ============================================================================

-- 1. New columns
alter table public.missions
  add column unlock_groups jsonb not null default '[]'::jsonb,
  add column unlock_after  timestamptz;

-- 2. Carry forward existing single-prereq data into the new shape:
--    M with prerequisite_mission_id = X  ->  unlock_groups = [["X"]]
update public.missions
   set unlock_groups = jsonb_build_array(
     jsonb_build_array(prerequisite_mission_id::text)
   )
 where prerequisite_mission_id is not null;

-- 3. Drop the now-redundant column
alter table public.missions drop column prerequisite_mission_id;

-- 4. Helpful index for the time-gate filter (rarely large but cheap)
create index if not exists idx_missions_unlock_after
  on public.missions(unlock_after)
  where unlock_after is not null;

-- ----------------------------------------------------------------------------
-- 5. Recompute function — DNF evaluation + time gates.
--    A mission is 'unlocked' for a team iff:
--      (a) unlock_after is null OR unlock_after <= now()
--      AND
--      (b) unlock_groups is empty OR ANY group is fully satisfied
--          (every mission_id in the group has team_mission_state.state
--           = 'approved' for this team).
--    Terminal states (approved / submitted / failed_expired) on tms are
--    sticky — recompute won't overwrite them. expires_at, once set, is
--    preserved.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_team_mission_state(p_team_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
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

  with desired as (
    select
      m.id as mission_id,
      m.deadline_mode,
      m.deadline_at,
      m.deadline_duration_sec,
      case
        -- Time gate hasn't elapsed yet: locked
        when m.unlock_after is not null and m.unlock_after > now() then 'locked'
        -- No unlock groups: available (subject to time gate, already passed)
        when jsonb_array_length(m.unlock_groups) = 0 then 'unlocked'
        -- DNF: any group satisfied -> unlocked.
        -- A group is satisfied iff every id in it is approved for this team,
        -- i.e. there is no id in the group that is NOT approved.
        when exists (
          select 1
          from jsonb_array_elements(m.unlock_groups) as g(group_arr)
          where not exists (
            select 1
            from jsonb_array_elements_text(g.group_arr) as gm(mid)
            where not exists (
              select 1 from public.team_mission_state tms
              where tms.team_id = p_team_id
                and tms.mission_id = gm.mid::uuid
                and tms.state = 'approved'
            )
          )
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
      when public.team_mission_state.state in ('approved','submitted','failed_expired')
        then public.team_mission_state.state
      else excluded.state
    end,
    expires_at = case
      when public.team_mission_state.expires_at is not null
        then public.team_mission_state.expires_at
      else excluded.expires_at
    end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Game-wide refresh — flips overdue missions to failed_expired AND
--    recomputes unlocks (so time gates fire without a cron). Used by the
--    GM Review/Leaderboard pages on read.
-- ----------------------------------------------------------------------------
create or replace function public.refresh_game_state(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  t_id uuid;
begin
  -- Authorization: must be GM (the underlying RPCs also check, but be
  -- explicit here so an unauthorized caller doesn't silently no-op).
  if not exists (
    select 1 from public.games where id = p_game_id and owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  perform public.expire_overdue_missions_for_game(p_game_id);

  -- Re-evaluate unlocks for every team (cheap; bounded by team count)
  for t_id in
    select id from public.teams where game_id = p_game_id
  loop
    perform public.recompute_team_mission_state(t_id);
  end loop;
end;
$$;
