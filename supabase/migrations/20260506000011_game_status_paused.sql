-- ============================================================================
-- Game lifecycle: add a 'paused' status.
-- ----------------------------------------------------------------------------
-- The GM can pause a running game (submissions close, banner shows) and
-- resume it. draft → active → (paused ⇄ active) → ended, with reopen.
-- ============================================================================

alter table public.games drop constraint if exists games_status_check;

alter table public.games
  add constraint games_status_check
  check (status in ('draft', 'active', 'paused', 'ended'));
