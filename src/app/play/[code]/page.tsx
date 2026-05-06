import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinTeam, leaveTeam } from "@/lib/player-actions";
import Countdown from "@/components/Countdown";
import Leaderboard from "@/components/Leaderboard";

export default async function PlayGamePage(
  props: PageProps<"/play/[code]">,
) {
  const { code: rawCode } = await props.params;
  const { error } = await props.searchParams;
  const code = rawCode.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, description, join_code, status")
    .eq("join_code", code)
    .single();

  if (!game) notFound();

  // Find the user's team in this game (if any)
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color, requires_password")
    .eq("game_id", game.id)
    .order("created_at", { ascending: true });

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
  const myTeam = teams?.find((t) => t.id === myTeamId) ?? null;

  // If on a team, fetch missions + state
  let missionsView: Array<{
    id: string;
    title: string;
    description: string | null;
    points: number;
    submission_type: "text" | "photo" | "video";
    state: string;
    expires_at: string | null;
  }> = [];
  let totalPoints = 0;

  if (myTeamId) {
    // Lazy expiry sweep — flips this team's overdue missions to failed_expired
    // before we render so the player sees correct state.
    await supabase.rpc("expire_overdue_missions_for_team", {
      p_team_id: myTeamId,
    });

    // Filter by assignment scope: a mission shows up either if it targets
    // every team OR if it has a specific assignment to *this* team.
    const missionCols =
      "id, title, description, points, submission_type, validation_mode, prerequisite_mission_id, deadline_mode, created_at";
    const [
      { data: missionsAll },
      { data: missionsSpecific },
      { data: states },
    ] = await Promise.all([
      supabase
        .from("missions")
        .select(missionCols)
        .eq("game_id", game.id)
        .eq("assignment_mode", "all"),
      supabase
        .from("missions")
        .select(`${missionCols}, mission_team_assignments!inner(team_id)`)
        .eq("game_id", game.id)
        .eq("assignment_mode", "specific")
        .eq("mission_team_assignments.team_id", myTeamId),
      supabase
        .from("team_mission_state")
        .select("mission_id, state, expires_at")
        .eq("team_id", myTeamId),
    ]);

    const missions = [...(missionsAll ?? []), ...(missionsSpecific ?? [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const stateMap = new Map(
      (states ?? []).map((s) => [
        s.mission_id,
        { state: s.state, expires_at: s.expires_at },
      ]),
    );

    missionsView = missions.map((m) => {
      const s = stateMap.get(m.id);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        points: m.points,
        submission_type: m.submission_type as "text" | "photo" | "video",
        state: s?.state ?? "locked",
        expires_at: s?.expires_at ?? null,
      };
    });

    totalPoints = missions.reduce((sum, m) => {
      return stateMap.get(m.id)?.state === "approved" ? sum + m.points : sum;
    }, 0);
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
      <Link href="/play" className="text-sm hover:underline">
        ← Other games
      </Link>

      <h1 className="text-3xl font-semibold mt-2">{game.name}</h1>
      {game.description && (
        <p className="text-black/70 dark:text-white/70 mt-1">
          {game.description}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mt-3">
          {error}
        </p>
      )}

      {!myTeam ? (
        <section className="mt-6">
          <h2 className="text-lg font-medium mb-3">Pick a team to join</h2>
          {teams && teams.length > 0 ? (
            <ul className="space-y-2">
              {teams.map((t) => (
                <li
                  key={t.id}
                  className="rounded border border-black/10 dark:border-white/10 p-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-4 h-4 rounded-full"
                        style={{ background: t.color }}
                        aria-hidden
                      />
                      <span className="font-medium">{t.name}</span>
                      {t.requires_password && (
                        <span
                          className="text-xs text-amber-700 dark:text-amber-300"
                          title="Password required to join"
                        >
                          🔒
                        </span>
                      )}
                    </div>
                    <form action={joinTeam} className="flex gap-2">
                      <input type="hidden" name="team_id" value={t.id} />
                      <input type="hidden" name="join_code" value={code} />
                      {t.requires_password && (
                        <input
                          name="password"
                          type="password"
                          placeholder="Team password"
                          required
                          autoComplete="off"
                          className="rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-sm w-40"
                        />
                      )}
                      <button
                        type="submit"
                        className="rounded bg-foreground text-background px-3 py-1 text-sm"
                      >
                        Join
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No teams have been set up by the GM yet.
            </p>
          )}
        </section>
      ) : (
        <section className="mt-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm">
              You&apos;re on team{" "}
              <span
                className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded"
                style={{
                  background: myTeam.color + "33",
                  color: myTeam.color,
                }}
              >
                {myTeam.name}
              </span>{" "}
              · {totalPoints} pts
            </p>
            <form action={leaveTeam}>
              <input type="hidden" name="team_id" value={myTeam.id} />
              <input type="hidden" name="join_code" value={code} />
              <button
                type="submit"
                className="text-sm text-red-600 hover:underline"
              >
                Leave team
              </button>
            </form>
          </div>

          <h2 className="text-lg font-medium mt-6 mb-3">Missions</h2>
          {missionsView.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              No missions yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {missionsView.map((m) => {
                const locked = m.state === "locked";
                const completed = m.state === "approved";
                const submitted = m.state === "submitted";
                const rejected = m.state === "rejected";
                const failed = m.state === "failed_expired";

                const pill = (() => {
                  if (locked)
                    return {
                      label: "🔒 Locked",
                      cls: "bg-black/10 dark:bg-white/10",
                    };
                  if (completed)
                    return {
                      label: "✓ Completed",
                      cls: "bg-green-600/20 text-green-700 dark:text-green-300",
                    };
                  if (submitted)
                    return {
                      label: "⏳ Submitted",
                      cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                    };
                  if (rejected)
                    return {
                      label: "✗ Try again",
                      cls: "bg-red-600/20 text-red-700 dark:text-red-300",
                    };
                  if (failed)
                    return {
                      label: "⌛ Time's up",
                      cls: "bg-red-700/20 text-red-700 dark:text-red-400",
                    };
                  return {
                    label: "Open",
                    cls: "bg-blue-600/20 text-blue-700 dark:text-blue-300",
                  };
                })();

                const inner = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{m.title}</p>
                      {m.description && (
                        <p className="text-sm text-black/70 dark:text-white/70 mt-0.5">
                          {m.description}
                        </p>
                      )}
                      <p className="text-xs text-black/50 dark:text-white/50 mt-1 flex items-center gap-2 flex-wrap">
                        <span>
                          {m.points} pts · {m.submission_type}
                        </span>
                        {m.expires_at && !completed && !failed && (
                          <Countdown expiresAt={m.expires_at} />
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-xs rounded px-2 py-0.5 self-center whitespace-nowrap ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                  </div>
                );

                const baseCls =
                  "block rounded border border-black/10 dark:border-white/10 p-3";
                if (locked || completed || submitted || failed) {
                  return (
                    <li key={m.id} className={`${baseCls} opacity-80`}>
                      {inner}
                    </li>
                  );
                }
                return (
                  <li key={m.id}>
                    <Link
                      href={`/play/${code}/m/${m.id}`}
                      className={`${baseCls} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
                    >
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-8">
            <Leaderboard gameId={game.id} highlightTeamId={myTeam.id} />
          </div>
        </section>
      )}
    </main>
  );
}
