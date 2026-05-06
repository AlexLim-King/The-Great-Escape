-- ============================================================================
-- Live realtime leaderboard + per-team join passwords
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-team password
-- ----------------------------------------------------------------------------
-- The hash itself stays server-side only. `requires_password` is a generated
-- column so clients can know whether to prompt for a password without ever
-- seeing the hash.
alter table public.teams
  add column join_password_hash text,
  add column requires_password boolean
    generated always as (join_password_hash is not null) stored;

-- Set / clear password (GM only)
create or replace function public.set_team_password(
  p_team_id uuid,
  p_password text
)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.teams t
    join public.games g on g.id = t.game_id
    where t.id = p_team_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if p_password is null or trim(p_password) = '' then
    update public.teams set join_password_hash = null where id = p_team_id;
  else
    update public.teams
       set join_password_hash = crypt(p_password, gen_salt('bf'))
     where id = p_team_id;
  end if;
end;
$$;

-- Join team — checks password if one is set, then inserts membership
create or replace function public.join_team_with_password(
  p_team_id uuid,
  p_password text
)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_uid  uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select join_password_hash into v_hash from public.teams where id = p_team_id;
  if not found then
    return 'not_found';
  end if;

  if v_hash is not null then
    if p_password is null or v_hash <> crypt(p_password, v_hash) then
      return 'wrong_password';
    end if;
  end if;

  insert into public.team_members (team_id, user_id)
  values (p_team_id, v_uid)
  on conflict do nothing;

  return 'ok';
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Leaderboard function — aggregate scores only (no per-mission detail leak)
-- ----------------------------------------------------------------------------
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
      coalesce(sum(m.points) filter (where tms.state = 'approved'), 0)::int,
      count(*) filter (where tms.state = 'approved')::int
    from public.teams t
    left join public.team_mission_state tms on tms.team_id = t.id
    left join public.missions m            on m.id = tms.mission_id
    where t.game_id = p_game_id
    group by t.id, t.name, t.color, t.created_at
    order by 4 desc, t.created_at asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Loosen team_mission_state SELECT so same-game teammates can drive the
-- realtime leaderboard. Only what's needed: state + expires_at, but RLS is
-- per-row so we authorize the row read (not specific columns).
-- ----------------------------------------------------------------------------
drop policy if exists "tms_select" on public.team_mission_state;

create policy "tms_select" on public.team_mission_state for select to authenticated using (
  exists (
    select 1 from public.team_members tm
    join public.teams my_team     on my_team.id = tm.team_id
    join public.teams target_team on target_team.id = team_mission_state.team_id
    where tm.user_id = auth.uid()
      and my_team.game_id = target_team.game_id
  )
  or exists (
    select 1 from public.teams t
    join public.games g on g.id = t.game_id
    where t.id = team_mission_state.team_id and g.owner_id = auth.uid()
  )
);

-- ----------------------------------------------------------------------------
-- 4. Realtime: publish team_mission_state changes so the leaderboard can
-- re-fetch live. Idempotent — adds only if not already in the publication.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_mission_state'
  ) then
    alter publication supabase_realtime add table public.team_mission_state;
  end if;
end $$;
