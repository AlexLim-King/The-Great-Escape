import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BatchMissionUpload from "@/components/BatchMissionUpload";

export default async function BatchMissionPage(
  props: PageProps<"/games/[id]/missions/batch">,
) {
  const { id } = await props.params;

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

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
      <Link
        href={`/games/${id}`}
        className="text-sm text-muted hover:text-text"
      >
        ← {game.name}
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1 tracking-tight">
        Batch upload missions
      </h1>
      <p className="text-sm text-muted mb-5">
        Select a set of images — each becomes a mission, titled from its file
        name, with the picture attached as the reference. Review and tweak
        before creating.
      </p>

      <BatchMissionUpload gameId={game.id} />
    </main>
  );
}
