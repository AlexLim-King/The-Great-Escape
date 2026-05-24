-- ============================================================================
-- Per-game player theme
-- ----------------------------------------------------------------------------
-- The GM picks a visual theme in game settings; the player surface
-- (/play/[code]/*) renders in that theme. 'default' = Editorial Modern,
-- 'matrix' = green-on-black hacker/CRT. New themes just add to the check
-- list + a [data-theme="x"] block in globals.css.
-- ============================================================================

alter table public.games
  add column if not exists theme text not null default 'default'
  check (theme in ('default', 'matrix'));
