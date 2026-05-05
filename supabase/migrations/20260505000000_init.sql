-- ============================================================================
-- Escape Room Mission Platform — Phase 1 schema
-- ============================================================================
-- Tables: profiles, games, teams, team_members, missions, submissions,
--         team_mission_state
-- Phase-1 scope: text + photo missions, linear prerequisites, manual teams.
-- ============================================================================

-- Make sure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- games  (an event hosted by an organizer / GM)
-- ----------------------------------------------------------------------------
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  join_code    text not null unique,
  status       text not null default 'draft' check (status in ('draft','active','ended')),
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_games_owner on public.games(owner_id);
create index idx_games_join_code on public.games(join_code);

-- ----------------------------------------------------------------------------
-- teams  (groups of players inside a game)
-- ----------------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  created_at  timestamptz not null default now(),
  unique (game_id, name)
);
create index idx_teams_game on public.teams(game_id);

-- ----------------------------------------------------------------------------
-- team_members  (player ↔ team)
-- ----------------------------------------------------------------------------
create table public.team_members (
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('captain','member')),
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index idx_tm_user on public.team_members(user_id);

-- ----------------------------------------------------------------------------
-- missions
-- ----------------------------------------------------------------------------
create table public.missions (
  id                       uuid primary key default gen_random_uuid(),
  game_id                  uuid not null references public.games(id) on delete cascade,
  title                    text not null,
  description              text,
  points                   int  not null default 10,
  submission_type          text not null check (submission_type in ('text','photo')),
  validation_mode          text not null check (validation_mode in ('auto','gm_judged')),
  expected_answer          text,                   -- only used when validation_mode='auto' and type='text'
  prerequisite_mission_id  uuid references public.missions(id) on delete set null,
  display_order            int  not null default 0,
  created_at               timestamptz not null default now()
);
create index idx_missions_game on public.missions(game_id);

-- ----------------------------------------------------------------------------
-- submissions
-- ----------------------------------------------------------------------------
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid not null references public.missions(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  submitted_by  uuid not null references auth.users(id) on delete cascade,
  payload_text  text,
  media_path    text,                              -- storage object path
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  feedback      text,
  verified_by   uuid references auth.users(id) on delete set null,
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_submissions_mission on public.submissions(mission_id);
create index idx_submissions_team    on public.submissions(team_id);
create index idx_submissions_status  on public.submissions(status);

-- ----------------------------------------------------------------------------
-- team_mission_state  (denormalized lock/unlock/completion per team)
-- ----------------------------------------------------------------------------
create table public.team_mission_state (
  team_id       uuid not null references public.teams(id) on delete cascade,
  mission_id    uuid not null references public.missions(id) on delete cascade,
  state         text not null default 'locked'
                check (state in ('locked','unlocked','submitted','approved','rejected')),
  completed_at  timestamptz,
  primary key (team_id, mission_id)
);
create index idx_tms_team on public.team_mission_state(team_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate a short, uppercase, unambiguous join code (e.g. "K3F9X2")
create or replace function public.gen_join_code()
returns text
language sql volatile as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

-- Recompute team_mission_state for a team (idempotent; never downgrades terminal states)
create or replace function public.recompute_team_mission_state(p_team_id uuid)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_game_id uuid;
begin
  select game_id into v_game_id from public.teams where id = p_team_id;
  if v_game_id is null then return; end if;

  insert into public.team_mission_state (team_id, mission_id, state)
  select
    p_team_id,
    m.id,
    case
      when m.prerequisite_mission_id is null then 'unlocked'
      when exists (
        select 1 from public.team_mission_state tms
        where tms.team_id = p_team_id
          and tms.mission_id = m.prerequisite_mission_id
          and tms.state = 'approved'
      ) then 'unlocked'
      else 'locked'
    end
  from public.missions m
  where m.game_id = v_game_id
  on conflict (team_id, mission_id) do update
  set state = case
    -- never downgrade terminal / pending states
    when public.team_mission_state.state in ('approved','submitted') then public.team_mission_state.state
    -- otherwise recompute
    when (select prerequisite_mission_id from public.missions where id = excluded.mission_id) is null then 'unlocked'
    when exists (
      select 1 from public.team_mission_state tms
      where tms.team_id = excluded.team_id
        and tms.mission_id = (select prerequisite_mission_id from public.missions where id = excluded.mission_id)
        and tms.state = 'approved'
    ) then 'unlocked'
    else 'locked'
  end;
end;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Initialize team_mission_state when a new team is created
create or replace function public.init_team_mission_state()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  perform public.recompute_team_mission_state(new.id);
  return new;
end;
$$;

create trigger on_team_created
  after insert on public.teams
  for each row execute procedure public.init_team_mission_state();

-- When a new mission is created, recompute state for all teams in that game
create or replace function public.init_mission_for_teams()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  t record;
begin
  for t in select id from public.teams where game_id = new.game_id loop
    perform public.recompute_team_mission_state(t.id);
  end loop;
  return new;
end;
$$;

create trigger on_mission_created
  after insert on public.missions
  for each row execute procedure public.init_mission_for_teams();

-- Auto-validate text submissions on insert (case-insensitive trim match)
create or replace function public.auto_validate_submission()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_mode text;
  v_type text;
  v_expected text;
begin
  select validation_mode, submission_type, expected_answer
    into v_mode, v_type, v_expected
  from public.missions where id = new.mission_id;

  if v_mode = 'auto' and v_type = 'text' and v_expected is not null then
    if lower(trim(coalesce(new.payload_text,''))) = lower(trim(v_expected)) then
      new.status := 'approved';
      new.verified_at := now();
    else
      new.status := 'rejected';
      new.feedback := 'Incorrect answer';
      new.verified_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger on_submission_auto_validate
  before insert on public.submissions
  for each row execute procedure public.auto_validate_submission();

-- React to status changes by updating team_mission_state
create or replace function public.on_submission_status_change()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update public.team_mission_state
       set state = 'approved', completed_at = now()
     where team_id = new.team_id and mission_id = new.mission_id;
    perform public.recompute_team_mission_state(new.team_id);

  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    -- allow resubmission
    update public.team_mission_state
       set state = 'unlocked'
     where team_id = new.team_id and mission_id = new.mission_id
       and state not in ('approved');

  elsif new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    update public.team_mission_state
       set state = 'submitted'
     where team_id = new.team_id and mission_id = new.mission_id
       and state not in ('approved');
  end if;
  return new;
end;
$$;

create trigger on_submission_change
  after insert or update on public.submissions
  for each row execute procedure public.on_submission_status_change();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.games               enable row level security;
alter table public.teams               enable row level security;
alter table public.team_members        enable row level security;
alter table public.missions            enable row level security;
alter table public.submissions         enable row level security;
alter table public.team_mission_state  enable row level security;

-- profiles: read all, edit own
create policy "profiles_select_all"   on public.profiles for select using (true);
create policy "profiles_insert_own"   on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on public.profiles for update using (auth.uid() = id);

-- games: any authenticated user can read (for join-by-code); only owner can write
create policy "games_select_auth"     on public.games for select to authenticated using (true);
create policy "games_insert_owner"    on public.games for insert to authenticated with check (owner_id = auth.uid());
create policy "games_update_owner"    on public.games for update to authenticated using (owner_id = auth.uid());
create policy "games_delete_owner"    on public.games for delete to authenticated using (owner_id = auth.uid());

-- teams: any authenticated user can read; GM of the game manages
create policy "teams_select_auth"     on public.teams for select to authenticated using (true);
create policy "teams_insert_gm"       on public.teams for insert to authenticated
  with check (exists (select 1 from public.games g where g.id = game_id and g.owner_id = auth.uid()));
create policy "teams_update_gm"       on public.teams for update to authenticated
  using (exists (select 1 from public.games g where g.id = teams.game_id and g.owner_id = auth.uid()));
create policy "teams_delete_gm"       on public.teams for delete to authenticated
  using (exists (select 1 from public.games g where g.id = teams.game_id and g.owner_id = auth.uid()));

-- team_members: read all (auth); user joins/leaves themselves; GM can remove anyone
create policy "tm_select_auth"        on public.team_members for select to authenticated using (true);
create policy "tm_insert_self"        on public.team_members for insert to authenticated with check (user_id = auth.uid());
create policy "tm_delete_self_or_gm"  on public.team_members for delete to authenticated using (
  user_id = auth.uid() or
  exists (select 1 from public.teams t join public.games g on g.id = t.game_id
          where t.id = team_id and g.owner_id = auth.uid())
);

-- missions: GM full; players see only missions in games they're a member of
create policy "missions_select"       on public.missions for select to authenticated using (
  exists (select 1 from public.games g where g.id = game_id and g.owner_id = auth.uid()) or
  exists (select 1 from public.team_members tm
          join public.teams t on t.id = tm.team_id
          where t.game_id = missions.game_id and tm.user_id = auth.uid())
);
create policy "missions_insert_gm"    on public.missions for insert to authenticated
  with check (exists (select 1 from public.games g where g.id = game_id and g.owner_id = auth.uid()));
create policy "missions_update_gm"    on public.missions for update to authenticated
  using (exists (select 1 from public.games g where g.id = missions.game_id and g.owner_id = auth.uid()));
create policy "missions_delete_gm"    on public.missions for delete to authenticated
  using (exists (select 1 from public.games g where g.id = missions.game_id and g.owner_id = auth.uid()));

-- submissions: team members can see their team's submissions; GM sees all in their games
create policy "submissions_select"    on public.submissions for select to authenticated using (
  exists (select 1 from public.team_members tm where tm.team_id = submissions.team_id and tm.user_id = auth.uid()) or
  exists (select 1 from public.missions m
          join public.games g on g.id = m.game_id
          where m.id = submissions.mission_id and g.owner_id = auth.uid())
);
create policy "submissions_insert"    on public.submissions for insert to authenticated with check (
  submitted_by = auth.uid() and
  exists (select 1 from public.team_members tm where tm.team_id = team_id and tm.user_id = auth.uid())
);
create policy "submissions_update_gm" on public.submissions for update to authenticated using (
  exists (select 1 from public.missions m
          join public.games g on g.id = m.game_id
          where m.id = submissions.mission_id and g.owner_id = auth.uid())
);

-- team_mission_state: read by team member or GM; writes only via SECURITY DEFINER triggers
create policy "tms_select"            on public.team_mission_state for select to authenticated using (
  exists (select 1 from public.team_members tm where tm.team_id = team_mission_state.team_id and tm.user_id = auth.uid()) or
  exists (select 1 from public.teams t join public.games g on g.id = t.game_id
          where t.id = team_mission_state.team_id and g.owner_id = auth.uid())
);

-- ============================================================================
-- STORAGE: bucket for photo submissions
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

-- Authenticated users can upload + read their own submission media
create policy "submissions_storage_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions');

create policy "submissions_storage_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'submissions');
