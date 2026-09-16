import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Leaderboard from "@/components/Leaderboard";
import TabNav from "@/components/TabNav";
import { gmTabs } from "@/lib/gm-tabs";

export default async function GMLeaderboardPage(
  props: PageProps<"/games/[id]/leaderboard">,
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

  // Lightweight pending count for the Review tab badge
  const { count: pendingCount } = await supabase
    .from("submissions")
    .select("id, missions!inner(game_id)", { count: "exact", head: true })
    .eq("missions.game_id", id)
    .eq("status", "pending");

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
      <header>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {game.name}
        </h1>
      </header>

      <TabNav current="Leaderboard" tabs={gmTabs(game.id, pendingCount ?? 0)} />

      <div className="flex justify-end">
        <a
          href={`/games/${game.id}/export?type=leaderboard`}
          download
          className="btn btn-secondary text-sm"
        >
          ↓ Export leaderboard CSV
        </a>
      </div>

      <Leaderboard gameId={game.id} />
    </main>
  );
}
