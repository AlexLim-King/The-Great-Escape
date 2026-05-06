-- ============================================================================
-- Guest joins (anonymous Supabase auth users) + GM "Discard" reset action
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. handle_new_user: graceful display_name fallback for anonymous users
--    Anonymous auth.users rows have a NULL email AND no display_name in
--    metadata unless the client passed one. split_part(NULL, ...) is NULL,
--    which would violate the not-null constraint on profiles.display_name.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Guest'
    )
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. submissions DELETE policy — GM of the mission's game can delete a row.
--    The discardSubmission server action constrains usage to rejected
--    submissions; this policy just unblocks the wire.
-- ----------------------------------------------------------------------------
create policy "submissions_delete_gm" on public.submissions for delete to authenticated using (
  exists (
    select 1 from public.missions m
    join public.games g on g.id = m.game_id
    where m.id = submissions.mission_id and g.owner_id = auth.uid()
  )
);
