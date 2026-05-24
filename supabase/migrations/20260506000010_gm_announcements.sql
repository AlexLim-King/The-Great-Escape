-- ============================================================================
-- GM announcements: broadcast a message to every player in a game.
-- ============================================================================
-- Reuses the existing notifications table so the bell, realtime channel,
-- and RLS all work unchanged. A broadcast fans out into one row per team
-- member; rows sharing identical (created_at, title, body) belong to the
-- same broadcast, which the listing RPC collapses for the GM.
-- ============================================================================

-- 1. Extend the type check constraint to include the new value.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'submission_approved',
    'submission_rejected',
    'mission_unlocked',
    'mission_expired',
    'new_submission',
    'gm_announcement'
  ));

-- 2. Broadcast RPC. SECURITY DEFINER because there's no INSERT policy on
--    notifications by design — only definer-rights triggers and definer
--    functions like this one write rows. Owner check is explicit at the
--    top so a misuse can't leak into other games.
create or replace function public.broadcast_announcement(
  p_game_id uuid,
  p_title   text,
  p_body    text default null
)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner_id   uuid;
  v_join_code  text;
  v_title      text := nullif(btrim(p_title), '');
  v_body       text := nullif(btrim(coalesce(p_body, '')), '');
  v_sent_at    timestamptz := now();
  v_count      int;
begin
  if v_title is null then
    raise exception 'Announcement title is required';
  end if;

  select owner_id, join_code into v_owner_id, v_join_code
  from public.games
  where id = p_game_id;

  if v_owner_id is null then
    raise exception 'Game not found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Not authorized to broadcast for this game';
  end if;

  with recipients as (
    select distinct tm.user_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where t.game_id = p_game_id
  )
  insert into public.notifications (user_id, game_id, type, title, body, href, created_at)
  select
    r.user_id,
    p_game_id,
    'gm_announcement',
    v_title,
    v_body,
    '/play/' || v_join_code || '/notifications',
    v_sent_at
  from recipients r;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.broadcast_announcement(uuid, text, text) to authenticated;

-- 3. Listing RPC for the GM's "last 10 announcements" panel. SECURITY
--    DEFINER + explicit owner check is required because the GM is not
--    a recipient of their own broadcasts, so RLS would hide every row.
create or replace function public.list_game_announcements(
  p_game_id uuid,
  p_limit   int default 10
)
returns table (
  created_at      timestamptz,
  title           text,
  body            text,
  recipient_count int
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.games where id = p_game_id;
  if v_owner_id is null then
    raise exception 'Game not found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    n.created_at,
    n.title,
    n.body,
    count(*)::int as recipient_count
  from public.notifications n
  where n.game_id = p_game_id
    and n.type = 'gm_announcement'
  group by n.created_at, n.title, n.body
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

grant execute on function public.list_game_announcements(uuid, int) to authenticated;
