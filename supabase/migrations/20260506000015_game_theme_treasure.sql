-- ============================================================================
-- Add the "treasure" player theme
-- ----------------------------------------------------------------------------
-- A third per-game player theme (pirate treasure hunt / tropical beach),
-- alongside 'default' (Editorial) and 'matrix'. Just widens the check
-- constraint; the visuals live in globals.css ([data-theme="treasure"]) +
-- TreasureBackdrop.tsx, applied by play/[code]/layout.tsx.
-- ============================================================================

alter table public.games
  drop constraint if exists games_theme_check;

alter table public.games
  add constraint games_theme_check
  check (theme in ('default', 'matrix', 'treasure'));
