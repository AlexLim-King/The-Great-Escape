-- ============================================================================
-- Atomic mission reorder
-- ============================================================================
-- Takes a game_id and an ordered array of mission ids, sets each mission's
-- display_order to its position in the array (1-based — matches WITH
-- ORDINALITY's idx). Single UPDATE with a values-from-unnest join means the
-- whole reorder commits atomically; partial reorders never leak.
-- ============================================================================

create or replace function public.reorder_missions(
  p_game_id uuid,
  p_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Authorization: must be the GM of this game
  if not exists (
    select 1 from public.games
    where id = p_game_id and owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update public.missions m
     set display_order = t.idx::int
    from unnest(p_ids) with ordinality as t(id, idx)
   where m.id = t.id
     and m.game_id = p_game_id;
end;
$$;
