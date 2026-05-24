import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinTeam, leaveTeam } from "@/lib/player-actions";
import Countdown from "@/components/Countdown";
import GameStartCountdown from "@/components/GameStartCountdown";
import TabNav from "@/components/TabNav";

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
    .select(
      "id, name, description, join_code, status, starts_at, location, image_path",
    )
    .eq("join_code", code)
    .single();

  if (!game) notFound();

  let coverUrl: string | null = null;
  if (game.image_path) {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(game.image_path, 60 * 60);
    coverUrl = data?.signedUrl ?? null;
  }

  // Auto-start a scheduled game whose time has come; use the effective
  // status for the banner below.
  const { data: refreshedStatus } = await supabase.rpc("refresh_game_status", {
    p_game_id: game.id,
  });
  const status = (refreshedStatus as string | null) ?? game.status;
  // Post-refresh, a still-draft game with a starts_at is necessarily
  // scheduled for the future (a due start would have auto-activated).
  const scheduledStart =
    status === "draft" && game.starts_at ? game.starts_at : null;

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
    // Lazy state refresh:
    //   1. Expire overdue (unlocked → failed_expired for past-deadline rows)
    //   2. Recompute (apply time gates: locked → unlocked when unlock_after
    //      has passed, and unlock anything whose unlock_groups are now
    //      satisfied). Order matters — expire first so the recompute sees
    //      the final terminal state.
    await supabase.rpc("expire_overdue_missions_for_team", {
      p_team_id: myTeamId,
    });
    await supabase.rpc("recompute_team_mission_state", {
      p_team_id: myTeamId,
    });

    // Filter by assignment scope: a mission shows up either if it targets
    // every team OR if it has a specific assignment to *this* team.
    const missionCols =
      "id, title, description, points, submission_type, validation_mode, unlock_groups, unlock_after, deadline_mode, created_at";
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

      {coverUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={coverUrl}
          alt=""
          className="mt-3 w-full max-h-52 object-cover rounded-xl border border-default"
        />
      )}

      <h1 className="text-3xl font-semibold mt-3 tracking-tight">
        {game.name}
      </h1>
      {game.location && (
        <p className="text-sm text-muted mt-1">📍 {game.location}</p>
      )}
      {game.description && (
        <p className="text-muted mt-1">{game.description}</p>
      )}

      {error && <p className="banner banner-error mt-3">{error}</p>}

      {status !== "active" &&
        (scheduledStart ? (
          <p className="banner banner-info mt-3 flex items-center gap-2">
            🚀 Game starts in{" "}
            <GameStartCountdown
              startsAt={scheduledStart}
              className="font-semibold"
            />
          </p>
        ) : (
          <p
            className={`banner mt-3 ${
              status === "ended" ? "banner-error" : "banner-info"
            }`}
          >
            {status === "draft"
              ? "This game hasn't started yet — submissions open once the GM starts it."
              : status === "paused"
                ? "⏸ The game is paused — submissions are temporarily closed."
                : "This game has ended — submissions are closed."}
          </p>
        ))}

      {!myTeam ? (
        <section className="mt-6">
          <h2 className="text-lg font-medium mb-3">Pick a team to join</h2>
          {teams && teams.length > 0 ? (
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.id} className="card card-compact">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-4 h-4 rounded-full ring-1 ring-default"
                        style={{ background: t.color }}
                        aria-hidden
                      />
                      <span className="font-medium">{t.name}</span>
                      {t.requires_password && (
                        <span
                          className="text-xs text-warn"
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
                          className="input w-40 py-1 text-sm"
                        />
                      )}
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                      >
                        Join
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No teams have been set up by the GM yet.
            </p>
          )}
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          <TabNav
            current="Missions"
            tabs={[
              { label: "Missions", href: `/play/${code}` },
              { label: "Leaderboard", href: `/play/${code}/leaderboard` },
              { label: "Notifications", href: `/play/${code}/notifications` },
            ]}
          />

          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm">
              You&apos;re on team{" "}
              <span
                className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: myTeam.color + "33",
                  color: myTeam.color,
                }}
              >
                {myTeam.name}
              </span>{" "}
              · <span className="font-mono font-semibold">{totalPoints}</span>{" "}
              <span className="text-muted">pts</span>
            </p>
            <form action={leaveTeam}>
              <input type="hidden" name="team_id" value={myTeam.id} />
              <input type="hidden" name="join_code" value={code} />
              <button
                type="submit"
                className="text-sm text-danger hover:underline"
              >
                Leave team
              </button>
            </form>
          </div>

          <h2 className="text-lg font-medium mt-6 mb-3">Missions</h2>
          {missionsView.length === 0 ? (
            <p className="text-sm text-muted">No missions yet.</p>
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
                    return { label: "🔒 Locked", cls: "pill pill-neutral" };
                  if (completed)
                    return { label: "✓ Completed", cls: "pill pill-success" };
                  if (submitted)
                    return { label: "⏳ Submitted", cls: "pill pill-warn" };
                  if (rejected)
                    return { label: "✗ Try again", cls: "pill pill-danger" };
                  if (failed)
                    return { label: "⌛ Time's up", cls: "pill pill-danger" };
                  return { label: "Open", cls: "pill pill-info" };
                })();

                const inner = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{m.title}</p>
                      {m.description && (
                        <p className="text-sm text-muted mt-0.5">
                          {m.description}
                        </p>
                      )}
                      <p className="text-xs text-subtle mt-1.5 flex items-center gap-2 flex-wrap">
                        <span>
                          {m.points} pts · {m.submission_type}
                        </span>
                        {m.expires_at && !completed && !failed && (
                          <Countdown expiresAt={m.expires_at} />
                        )}
                      </p>
                    </div>
                    <span className={`${pill.cls} self-center`}>
                      {pill.label}
                    </span>
                  </div>
                );

                if (locked || completed || submitted || failed) {
                  return (
                    <li
                      key={m.id}
                      className="card card-compact opacity-70"
                    >
                      {inner}
                    </li>
                  );
                }
                return (
                  <li key={m.id}>
                    <Link
                      href={`/play/${code}/m/${m.id}`}
                      className="card card-compact card-interactive block"
                    >
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
