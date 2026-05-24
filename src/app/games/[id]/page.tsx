import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  deleteTeam,
  deleteMission,
  reorderMissions,
  deleteGame,
  setTeamPassword,
} from "@/lib/gm-actions";
import TabNav from "@/components/TabNav";
import AddTeamForm from "@/components/AddTeamForm";
import SortableMissionList, {
  type SortableMission,
} from "@/components/SortableMissionList";

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

  // Setup-page data: teams + missions, plus a lightweight pending count for
  // the Review tab badge. We deliberately don't fetch the full submissions
  // list here — that's the Review page's job.
  const [{ data: teams }, { data: missions }, { count: pendingCount }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, color, requires_password, created_at")
        .eq("game_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("missions")
        .select(
          "id, title, description, points, submission_type, validation_mode, expected_answer, unlock_groups, unlock_after, deadline_mode, deadline_at, deadline_duration_sec, assignment_mode, reference_image_path, display_order, created_at, mission_team_assignments(team_id)",
        )
        .eq("game_id", id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("submissions")
        .select("id, missions!inner(game_id)", { count: "exact", head: true })
        .eq("missions.game_id", id)
        .eq("status", "pending"),
    ]);

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

  const missionTitleById = new Map(
    (missions ?? []).map((m) => [m.id, m.title]),
  );

  // Shape the missions for the SortableMissionList client component.
  // Generated DB types widen enum-like text columns to plain string;
  // CHECK constraints guarantee the runtime values, so narrow here.
  const sortableMissions: SortableMission[] = (missions ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    points: m.points,
    submission_type: m.submission_type as SortableMission["submission_type"],
    validation_mode: m.validation_mode as SortableMission["validation_mode"],
    unlock_groups: (m.unlock_groups ?? []) as string[][],
    unlock_after: m.unlock_after,
    deadline_mode: m.deadline_mode as SortableMission["deadline_mode"],
    deadline_at: m.deadline_at,
    deadline_duration_sec: m.deadline_duration_sec,
    assignment_mode: m.assignment_mode as SortableMission["assignment_mode"],
    assignment_count: m.mission_team_assignments?.length ?? 0,
    reference_url: referenceUrls.get(m.id) ?? null,
  }));

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <header>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          ← All games
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">{game.name}</h1>
            {game.description && (
              <p className="text-muted text-base max-w-xl">
                {game.description}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 card card-compact !py-1.5 !px-3">
                <span className="text-xs text-muted uppercase tracking-wider">
                  Join code
                </span>
                <span
                  data-testid="join-code"
                  className="font-mono text-lg font-semibold tracking-wider text-gradient"
                  style={{ background: "var(--gradient-brand)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                >
                  {game.join_code}
                </span>
              </div>
              <span className="pill pill-success">● {game.status}</span>
            </div>
          </div>
          <form action={deleteGame}>
            <input type="hidden" name="id" value={game.id} />
            <button
              type="submit"
              className="text-sm text-danger hover:underline"
            >
              Delete game
            </button>
          </form>
        </div>
        {error && <p className="banner banner-error mt-3">{error}</p>}
      </header>

      <TabNav
        current="Setup"
        tabs={[
          { label: "Setup", href: `/games/${game.id}` },
          {
            label: "Review",
            href: `/games/${game.id}/review`,
            badge: pendingCount ?? 0,
            badgeTone: "warn",
          },
          { label: "Leaderboard", href: `/games/${game.id}/leaderboard` },
          { label: "Settings", href: `/games/${game.id}/settings` },
        ]}
      />

      {/* Teams */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Teams</h2>

        {teams && teams.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {teams.map((t) => (
              <li key={t.id} className="card card-compact space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block w-4 h-4 rounded-full ring-1 ring-default"
                      style={{ background: t.color }}
                      aria-hidden
                    />
                    <span className="font-medium">{t.name}</span>
                    {t.requires_password && (
                      <span
                        className="pill pill-warn"
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
                      className="text-sm text-danger hover:underline"
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
                    className="input flex-1"
                  />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    {t.requires_password ? "Update" : "Set"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted mb-4">No teams yet.</p>
        )}

        <AddTeamForm gameId={game.id} />
      </section>

      {/* Missions */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-xl font-semibold">Missions</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/games/${game.id}/missions/batch`}
              className="btn btn-secondary btn-sm"
            >
              Batch upload
            </Link>
            <Link
              href={`/games/${game.id}/missions/new`}
              className="btn btn-primary btn-sm"
            >
              + Add mission
            </Link>
          </div>
        </div>

        <SortableMissionList
          gameId={game.id}
          initial={sortableMissions}
          missionTitleById={Object.fromEntries(missionTitleById)}
          reorderMissions={reorderMissions}
          deleteMission={deleteMission}
        />
      </section>
    </main>
  );
}
