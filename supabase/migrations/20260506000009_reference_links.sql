-- ============================================================================
-- Reference links on missions
-- ============================================================================
-- Lets the GM attach external URLs ("watch this clip first", "map", etc.)
-- alongside the optional reference image. Stored as a jsonb array of
-- {label, url} objects to keep the surface minimal.
-- ============================================================================

alter table public.missions
  add column reference_links jsonb not null default '[]'::jsonb;
