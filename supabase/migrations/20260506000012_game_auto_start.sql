-- ============================================================================
-- Lazy game auto-start
-- ----------------------------------------------------------------------------
-- A "scheduled" game is status='draft' with a future starts_at. When that
-- time arrives it should go live. Mirroring the app's lazy team_mission_state
-- refresh (no cron), this flips draft → active on the next read. SECURITY
-- DEFINER so a player's page read can trigger the flip despite games_update
-- RLS being owner-only. Returns the current (possibly just-updated) status so
-- callers don't need a re-read.
-- ============================================================================

create or replace function public.refresh_game_status(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.games
    set status = 'active'
  where id = p_game_id
    and status = 'draft'
    and starts_at is not null
    and starts_at <= now();

  select status into v_status from public.games where id = p_game_id;
  return v_status;
end;
$$;

grant execute on function public.refresh_game_status(uuid) to authenticated;
