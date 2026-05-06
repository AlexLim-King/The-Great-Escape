import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createTeam,
  deleteTeam,
  deleteMission,
  judgeSubmission,
  deleteGame,
  setTeamPassword,
} from "@/lib/gm-actions";
import Leaderboard from "@/components/Leaderboard";

export default async function GameDashboard(props: PageProps<"/games/[id]">) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, description, join_code, status, owner_id")
    .eq("id", id)
    .single();

  if (!game) notFound();
  if (game.owner_id !== user.id) redirect("/games");

  const [{ data: teams }, { data: missions }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color, requires_password, created_at")
      .eq("game_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("missions")
      .select(
        "id, title, description, points, submission_type, validation_mode, expected_answer, prerequisite_mission_id, deadline_mode, deadline_at, deadline_duration_sec, assignment_mode, reference_image_path, created_at, mission_team_assignments(team_id)",
      )
      .eq("game_id", id)
      .order("created_at", { ascending: true }),
  ]);

  // Lazy expiry sweep — flips overdue unlocked missions to failed_expired
  // before we render so the dashboard counts and statuses are accurate.
  await supabase.rpc("expire_overdue_missions_for_game", { p_game_id: id });

  // Generate signed URLs for any mission reference images
  const referenceUrls = new Map<string, string>();
  if (missions) {
    for (const m of missions) {
      if (m.reference_image_path) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(m.reference_image_path, 60 * 60);
        if (data?.signedUrl) referenceUrls.set(m.id, data.signedUrl);
      }
    }
  }

  // Pending submissions across all missions in this game
  const { data: pending } = await supabase
    .from("submissions")
    .select(
      "id, status, payload_text, media_path, created_at, mission_id, team_id, missions!inner(title, game_id, submission_type), teams!inner(name, color)",
    )
    .eq("missions.game_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Generate signed URLs for any photo submissions awaiting judgment
  const signedUrls = new Map<string, string>();
  if (pending) {
    for (const s of pending) {
      if (s.media_path) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(s.media_path, 60 * 60);
        if (data?.signedUrl) signedUrls.set(s.id, data.signedUrl);
      }
    }
  }

  const missionTitleById = new Map(
    (missions ?? []).map((m) => [m.id, m.title]),
  );

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <header>
        <Link
          href="/games"
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← All games
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold">{game.name}</h1>
            {game.description && (
              <p className="text-black/70 dark:text-white/70 mt-1">
                {game.description}
              </p>
            )}
            <p className="text-sm mt-2">
              Join code:{" "}
              <span className="font-mono text-lg bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded">
                {game.join_code}
              </span>{" "}
              · status: {game.status}
            </p>
          </div>
          <form action={deleteGame}>
            <input type="hidden" name="id" value={game.id} />
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Delete game
            </button>
          </form>
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mt-3">
            {error}
          </p>
        )}
      </header>

      {/* Teams */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Teams</h2>

        {teams && teams.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {teams.map((t) => (
              <li
                key={t.id}
                className="rounded border border-black/10 dark:border-white/10 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block w-4 h-4 rounded-full"
                      style={{ background: t.color }}
                      aria-hidden
                    />
                    <span>{t.name}</span>
                    {t.requires_password && (
                      <span
                        className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5"
                        title="Password required to join"
                      >
                        🔒 password set
                      </span>
                    )}
                  </div>
                  <form action={deleteTeam}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="game_id" value={game.id} />
                    <button
                      type="submit"
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                </div>
                <form action={setTeamPassword} className="flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="game_id" value={game.id} />
                  <input
                    name="password"
                    type="text"
                    placeholder={
                      t.requires_password
                        ? "Change password (blank to clear)"
                        : "Set password (optional)"
                    }
                    className="flex-1 rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="text-sm rounded border border-black/15 dark:border-white/15 px-3"
                  >
                    {t.requires_password ? "Update" : "Set"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60 mb-4">
            No teams yet.
          </p>
        )}

        <form action={createTeam} className="flex gap-2 flex-wrap">
          <input type="hidden" name="game_id" value={game.id} />
          <input
            name="name"
            placeholder="Team name"
            required
            className="rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 flex-1 min-w-[10rem]"
          />
          <input
            name="password"
            type="text"
            placeholder="Password (optional)"
            className="rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 w-44"
          />
          <input
            name="color"
            type="color"
            defaultValue="#3b82f6"
            className="h-10 w-12 rounded border border-black/15 dark:border-white/15"
          />
          <button
            type="submit"
            className="rounded bg-foreground text-background px-4 py-2 text-sm"
          >
            Add team
          </button>
        </form>
      </section>

      {/* Leaderboard */}
      <Leaderboard gameId={game.id} />


      {/* Missions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Missions</h2>
          <Link
            href={`/games/${game.id}/missions/new`}
            className="rounded bg-foreground text-background px-4 py-2 text-sm"
          >
            + Add mission
          </Link>
        </div>

        {missions && missions.length > 0 ? (
          <ul className="space-y-2">
            {missions.map((m) => (
              <li
                key={m.id}
                className="rounded border border-black/10 dark:border-white/10 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  {referenceUrls.get(m.id) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={referenceUrls.get(m.id)!}
                      alt=""
                      className="w-16 h-16 object-cover rounded border border-black/10 dark:border-white/10 flex-none"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
                      {m.submission_type} · {m.validation_mode} · {m.points} pts
                      {" · "}
                      <span className="text-blue-700 dark:text-blue-300">
                        {m.assignment_mode === "all"
                          ? "all teams"
                          : `${m.mission_team_assignments?.length ?? 0} team${
                              (m.mission_team_assignments?.length ?? 0) === 1
                                ? ""
                                : "s"
                            }`}
                      </span>
                      {m.prerequisite_mission_id && (
                        <>
                          {" "}
                          · requires{" "}
                          <span className="italic">
                            {missionTitleById.get(m.prerequisite_mission_id) ??
                              "?"}
                          </span>
                        </>
                      )}
                      {m.deadline_mode && (
                        <>
                          {" "}·{" "}
                          <span className="text-amber-700 dark:text-amber-300">
                            {m.deadline_mode === "absolute"
                              ? `until ${m.deadline_at ? new Date(m.deadline_at).toLocaleString() : "?"}`
                              : m.deadline_mode === "relative_to_unlock"
                                ? `${Math.round((m.deadline_duration_sec ?? 0) / 60)} min after unlock`
                                : `${Math.round((m.deadline_duration_sec ?? 0) / 60)} min from start`}
                          </span>
                        </>
                      )}
                    </p>
                    {m.description && (
                      <p className="text-sm mt-1">{m.description}</p>
                    )}
                  </div>
                  <form action={deleteMission}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="game_id" value={game.id} />
                    <button
                      type="submit"
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">
            No missions yet.
          </p>
        )}
      </section>

      {/* Judging queue */}
      <section>
        <h2 className="text-xl font-semibold mb-3">
          Pending submissions ({pending?.length ?? 0})
        </h2>

        {pending && pending.length > 0 ? (
          <ul className="space-y-3">
            {pending.map((s) => {
              const mission = Array.isArray(s.missions) ? s.missions[0] : s.missions;
              const team = Array.isArray(s.teams) ? s.teams[0] : s.teams;
              return (
                <li
                  key={s.id}
                  className="rounded border border-black/10 dark:border-white/10 p-3"
                >
                  <p className="text-sm">
                    <span className="font-medium">{team?.name}</span>
                    {" → "}
                    <span>{mission?.title}</span>
                  </p>

                  {s.payload_text && (
                    <p className="mt-2 text-sm bg-black/5 dark:bg-white/5 rounded p-2 whitespace-pre-wrap">
                      {s.payload_text}
                    </p>
                  )}

                  {s.media_path && signedUrls.get(s.id) && (
                    <div className="mt-2">
                      {mission?.submission_type === "video" ? (
                        <video
                          src={signedUrls.get(s.id)!}
                          controls
                          className="max-h-64 rounded border border-black/10 dark:border-white/10"
                        />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={signedUrls.get(s.id)!}
                          alt="Submission"
                          className="max-h-64 rounded border border-black/10 dark:border-white/10"
                        />
                      )}
                    </div>
                  )}

                  <form action={judgeSubmission} className="mt-3 flex gap-2 flex-wrap items-center">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="game_id" value={game.id} />
                    <input
                      name="feedback"
                      placeholder="Feedback (optional)"
                      className="rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 flex-1 min-w-[12rem]"
                    />
                    <button
                      type="submit"
                      name="decision"
                      value="approved"
                      className="rounded bg-green-600 text-white px-3 py-1.5 text-sm"
                    >
                      Approve
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="rejected"
                      className="rounded bg-red-600 text-white px-3 py-1.5 text-sm"
                    >
                      Reject
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">
            No submissions awaiting review.
          </p>
        )}
      </section>
    </main>
  );
}
