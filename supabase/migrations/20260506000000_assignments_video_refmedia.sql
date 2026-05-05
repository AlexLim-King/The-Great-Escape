-- ============================================================================
-- Per-team mission assignment, video submissions, mission reference images
-- ============================================================================
-- * Missions can target all teams (default) or a specific subset via the new
--   mission_team_assignments join table.
-- * `submission_type` gains a 'video' option (always GM-judged).
-- * Missions can carry a `reference_image_path` that points at an image in the
--   `submissions` storage bucket; players see it as visual context for the
--   mission.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mission reference image
-- ----------------------------------------------------------------------------
alter table public.missions
  add column reference_image_path text;

-- ----------------------------------------------------------------------------
-- 2. Video submissions
-- ----------------------------------------------------------------------------
alter table public.missions drop constraint missions_submission_type_check;
alter table public.missions add constraint missions_submission_type_check
  check (submission_type in ('text','photo','video'));

-- ----------------------------------------------------------------------------
-- 3. Per-team assignment
-- ----------------------------------------------------------------------------
alter table public.missions
  add column assignment_mode text not null default 'all'
    check (assignment_mode in ('all','specific'));

create table public.mission_team_assignments (
  mission_id  uuid not null references public.missions(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (mission_id, team_id)
);
create index idx_mta_team on public.mission_team_assignments(team_id);

alter table public.mission_team_assignments enable row level security;

-- GM owns the rows; team members can read assignments for their team
create policy "mta_select" on public.mission_team_assignments for select to authenticated using (
  exists (
    select 1 from public.missions m
    join public.games g on g.id = m.game_id
    where m.id = mission_id
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from public.team_members tm
          where tm.team_id = mission_team_assignments.team_id
            and tm.user_id = auth.uid()
        )
      )
  )
);
create policy "mta_insert_gm" on public.mission_team_assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.missions m
      join public.games g on g.id = m.game_id
      where m.id = mission_id and g.owner_id = auth.uid()
    )
  );
create policy "mta_delete_gm" on public.mission_team_assignments for delete to authenticated
  using (
    exists (
      select 1 from public.missions m
      join public.games g on g.id = m.game_id
      where m.id = mission_id and g.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Recompute now scopes by assignment
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
      and (
        m.assignment_mode = 'all'
        or exists (
          select 1 from public.mission_team_assignments mta
          where mta.mission_id = m.id and mta.team_id = p_team_id
        )
      )
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
-- 5. New mission insertion: only initialize state for assigned teams
-- ----------------------------------------------------------------------------
-- The existing init_mission_for_teams loops over every team and calls
-- recompute. Since recompute now self-filters by assignment, the loop is
-- still correct: teams that aren't assigned simply get no row inserted.
-- (No change needed.)

-- ----------------------------------------------------------------------------
-- 6. When a team is added to a mission's specific-assignment list, recompute
-- ----------------------------------------------------------------------------
create or replace function public.on_assignment_change()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  perform public.recompute_team_mission_state(coalesce(new.team_id, old.team_id));
  return null;
end;
$$;

create trigger on_assignment_inserted
  after insert on public.mission_team_assignments
  for each row execute procedure public.on_assignment_change();
