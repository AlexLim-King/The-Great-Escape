import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Leaderboard from "@/components/Leaderboard";
import TabNav from "@/components/TabNav";

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
        <Link
          href="/games"
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{game.name}</h1>
      </header>

      <TabNav
        current="Leaderboard"
        tabs={[
          { label: "Setup", href: `/games/${game.id}` },
          {
            label: "Review",
            href: `/games/${game.id}/review`,
            badge: pendingCount ?? 0,
            badgeTone: "warn",
          },
          { label: "Leaderboard", href: `/games/${game.id}/leaderboard` },
        ]}
      />

      <Leaderboard gameId={game.id} />
    </main>
  );
}
