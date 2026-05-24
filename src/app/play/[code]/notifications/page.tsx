import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabNav from "@/components/TabNav";
import PlayerNotificationsList, {
  type PlayerNotification,
} from "@/components/PlayerNotificationsList";

export default async function PlayNotificationsPage(
  props: PageProps<"/play/[code]/notifications">,
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
    .select("id, name, join_code")
    .eq("join_code", code)
    .single();
  if (!game) notFound();

  // Only players who've actually joined a team in this game see the
  // history. The bell itself works regardless, but this surface is
  // game-scoped — bouncing them to the team picker keeps the URL
  // meaningful.
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

  // All notifications for this user scoped to this game. RLS already
  // restricts to user_id = auth.uid(), but we filter by game_id too to
  // keep the page genuinely game-specific. The bell can still show the
  // cross-game feed.
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .eq("game_id", game.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const initial = (rows ?? []) as PlayerNotification[];

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">
      <header>
        <Link href="/play" className="text-sm text-muted hover:text-text">
          ← Other games
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {game.name}
        </h1>
      </header>

      <TabNav
        current="Notifications"
        tabs={[
          { label: "Missions", href: `/play/${code}` },
          { label: "Leaderboard", href: `/play/${code}/leaderboard` },
          { label: "Notifications", href: `/play/${code}/notifications` },
        ]}
      />

      <section>
        <h2 className="text-lg font-medium mb-3">Notifications</h2>
        <PlayerNotificationsList
          userId={user.id}
          gameId={game.id}
          selfHref={`/play/${code}/notifications`}
          initial={initial}
        />
      </section>
    </main>
  );
}
