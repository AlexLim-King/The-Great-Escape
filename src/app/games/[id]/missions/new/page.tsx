import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MissionForm from "@/components/MissionForm";

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

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mb-4">
          {error}
        </p>
      )}

      <MissionForm gameId={game.id} missions={missions ?? []} />
    </main>
  );
}
