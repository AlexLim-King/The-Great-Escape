-- ============================================================================
-- Block guests (anonymous auth users) from hosting games
-- ============================================================================
-- Defense in depth — server actions also gate this, but RLS is the source of
-- truth so a malicious client hitting the REST endpoint directly cannot bypass
-- the check. Implemented as a function so we can extend it later (e.g. add a
-- "verified GM" flag without touching every caller).
-- ============================================================================

create or replace function public.can_host_games()
returns boolean
language sql security definer stable
set search_path = public
as $$
  -- Anonymous Supabase users have is_anonymous=true on the JWT.
  -- Coalesce because non-anon JWTs may omit the claim entirely.
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
  -- TODO (Phase 2): once GM verification is wired, also check
  -- profiles.is_gm = true here.
$$;

drop policy if exists "games_insert_owner" on public.games;

create policy "games_insert_owner" on public.games
for insert to authenticated
with check (
  owner_id = auth.uid() and public.can_host_games()
);
