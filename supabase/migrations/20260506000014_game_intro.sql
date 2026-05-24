-- ============================================================================
-- Game intro details: cover image + location
-- ----------------------------------------------------------------------------
-- A cover image (stored in the `submissions` bucket under game-media/...,
-- signed for reads) and an optional free-text location, both shown to
-- players on the join/intro screen.
-- ============================================================================

alter table public.games
  add column if not exists image_path text,
  add column if not exists location text;
