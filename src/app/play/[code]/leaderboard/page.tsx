import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Leaderboard from "@/components/Leaderboard";
import TabNav from "@/components/TabNav";

export default async function PlayLeaderboardPage(
  props: PageProps<"/play/[code]/leaderboard">,
) {
  const { code: rawCode } = await props.params;
  const code = rawCode.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, description, join_code")
    .eq("join_code", code)
    .single();
  if (!game) notFound();

  // Find the user's team in this game (for the "you're on..." pill +
  // leaderboard row highlight). If they haven't joined a team, fall back
  // to the missions screen so they can pick one.
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("game_id", game.id);
  const teamIds = (teams ?? []).map((t) => t.id);

  let myTeamId: string | null = null;
  if (teamIds.length > 0) {
    const { data: myMembership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .in("team_id", teamIds)
      .maybeSingle();
    myTeamId = myMembership?.team_id ?? null;
  }
  if (!myTeamId) redirect(`/play/${code}`);

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">
      <header>
        <Link href="/play" className="text-sm hover:underline">
          ← Other games
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{game.name}</h1>
      </header>

      <TabNav
        current="Leaderboard"
        tabs={[
          { label: "Missions", href: `/play/${code}` },
          { label: "Leaderboard", href: `/play/${code}/leaderboard` },
        ]}
      />

      <Leaderboard gameId={game.id} highlightTeamId={myTeamId} />
    </main>
  );
}
