import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMission } from "@/lib/gm-actions";

export default async function NewMissionPage(
  props: PageProps<"/games/[id]/missions/new">,
) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, owner_id")
    .eq("id", id)
    .single();

  if (!game) notFound();
  if (game.owner_id !== user.id) redirect("/games");

  const { data: missions } = await supabase
    .from("missions")
    .select("id, title")
    .eq("game_id", id)
    .order("created_at", { ascending: true });

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <Link
        href={`/games/${id}`}
        className="text-sm text-black/60 dark:text-white/60 hover:underline"
      >
        ← {game.name}
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">New mission</h1>

      <form action={createMission} className="space-y-4">
        <input type="hidden" name="game_id" value={game.id} />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2">
            {error}
          </p>
        )}

        <label className="block">
          <span className="text-sm">Title</span>
          <input
            name="title"
            required
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm">Description / clue</span>
          <textarea
            name="description"
            rows={3}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Submission type</span>
            <select
              name="submission_type"
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
              defaultValue="text"
            >
              <option value="text">Text</option>
              <option value="photo">Photo</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Validation</span>
            <select
              name="validation_mode"
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
              defaultValue="auto"
            >
              <option value="auto">Auto (exact answer)</option>
              <option value="gm_judged">GM judged</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm">
            Expected answer (only for auto-validated text)
          </span>
          <input
            name="expected_answer"
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Points</span>
            <input
              name="points"
              type="number"
              defaultValue={10}
              min={0}
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm">Unlocks after</span>
            <select
              name="prerequisite_mission_id"
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
              defaultValue="none"
            >
              <option value="none">— always available —</option>
              {missions?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="rounded bg-foreground text-background px-4 py-2 font-medium"
        >
          Create mission
        </button>
      </form>
    </main>
  );
}
