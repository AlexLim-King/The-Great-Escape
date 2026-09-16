import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabNav from "@/components/TabNav";
import { gmTabs } from "@/lib/gm-tabs";

// Visual treatment for each team_mission_state value (+ a synthetic "na"
// for missions a team isn't assigned). Reuses the pill tokens so it tracks
// the active theme.
const CELL: Record<
  string,
  { icon: string; cls: string; label: string }
> = {
  locked: { icon: "🔒", cls: "pill-neutral", label: "Locked" },
  unlocked: { icon: "○", cls: "pill-info", label: "Unlocked" },
  submitted: { icon: "⏳", cls: "pill-warn", label: "Pending review" },
  approved: { icon: "✓", cls: "pill-success", label: "Completed" },
  rejected: { icon: "↺", cls: "pill-danger", label: "Rejected — can retry" },
  failed_expired: { icon: "✕", cls: "pill-danger", label: "Expired" },
  na: { icon: "·", cls: "opacity-30", label: "Not assigned" },
};

const LEGEND: Array<{ state: string }> = [
  { state: "approved" },
  { state: "submitted" },
  { state: "unlocked" },
  { state: "locked" },
  { state: "failed_expired" },
  { state: "na" },
];

export default async function ProgressPage(
  props: PageProps<"/games/[id]/progress">,
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

  // Keep state fresh (time gates / expiries) before reading the grid.
  await supabase.rpc("refresh_game_state", { p_game_id: id });

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name, color, created_at")
    .eq("game_id", id)
    .order("created_at", { ascending: true });
  const teams = teamRows ?? [];
  const teamIds = teams.map((t) => t.id);

  const { data: missionRows } = await supabase
    .from("missions")
    .select("id, title, points, assignment_mode, display_order, created_at")
    .eq("game_id", id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  const missions = missionRows ?? [];

  // Specific-mission assignments (mission -> set of team ids).
  const assignedByMission = new Map<string, Set<string>>();
  const missionIds = missions.map((m) => m.id);
  if (missionIds.length > 0) {
    const { data: assignments } = await supabase
      .from("mission_team_assignments")
      .select("mission_id, team_id")
      .in("mission_id", missionIds);
    for (const a of assignments ?? []) {
      if (!assignedByMission.has(a.mission_id))
        assignedByMission.set(a.mission_id, new Set());
      assignedByMission.get(a.mission_id)!.add(a.team_id);
    }
  }

  // Per-team mission state (RLS lets the owning GM read every team's rows).
  const stateByKey = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: tms } = await supabase
      .from("team_mission_state")
      .select("team_id, mission_id, state")
      .in("team_id", teamIds);
    for (const s of tms ?? [])
      stateByKey.set(`${s.team_id}:${s.mission_id}`, s.state);
  }

  // Lightweight pending count for the Review tab badge.
  const { count: pendingCount } = await supabase
    .from("submissions")
    .select("id, missions!inner(game_id)", { count: "exact", head: true })
    .eq("missions.game_id", id)
    .eq("status", "pending");

  type Mission = (typeof missions)[number];
  function cellState(m: Mission, teamId: string): string {
    if (m.assignment_mode === "specific") {
      const set = assignedByMission.get(m.id);
      if (!set || !set.has(teamId)) return "na";
    }
    return stateByKey.get(`${teamId}:${m.id}`) ?? "locked";
  }

  // Completed / assigned tally per team for the header.
  const summary = new Map<string, { done: number; total: number }>();
  for (const t of teams) {
    let done = 0;
    let total = 0;
    for (const m of missions) {
      const st = cellState(m, t.id);
      if (st === "na") continue;
      total++;
      if (st === "approved") done++;
    }
    summary.set(t.id, { done, total });
  }

  const empty = teams.length === 0 || missions.length === 0;

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
      <header>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {game.name}
        </h1>
      </header>

      <TabNav current="Progress" tabs={gmTabs(game.id, pendingCount ?? 0)} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-semibold tracking-tight">
            Team progress
          </h2>
          <p className="text-sm text-muted">
            {teams.length} {teams.length === 1 ? "team" : "teams"} ·{" "}
            {missions.length} {missions.length === 1 ? "mission" : "missions"}
          </p>
        </div>

        {/* Legend */}
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          {LEGEND.map(({ state }) => {
            const c = CELL[state];
            return (
              <li key={state} className="flex items-center gap-1.5">
                <span
                  className={`pill ${c.cls} w-6 h-6 !px-0 inline-flex items-center justify-center`}
                  aria-hidden
                >
                  {c.icon}
                </span>
                {c.label}
              </li>
            );
          })}
        </ul>

        {empty ? (
          <p className="text-sm text-muted">
            {teams.length === 0
              ? "No teams yet — add some on the Setup tab."
              : "No missions yet — add some on the Setup tab."}
          </p>
        ) : (
          <div className="overflow-x-auto border border-default rounded-lg">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface text-left font-medium text-muted px-3 py-2 border-b border-default min-w-[12rem]">
                    Mission
                  </th>
                  {teams.map((t) => {
                    const s = summary.get(t.id)!;
                    return (
                      <th
                        key={t.id}
                        className="px-3 py-2 border-b border-l border-default font-medium align-bottom"
                      >
                        <div className="flex flex-col items-center gap-1 min-w-[4.5rem]">
                          <span
                            className="inline-block w-3 h-3 rounded-full ring-2 ring-[var(--color-border)]"
                            style={{ background: t.color }}
                            aria-hidden
                          />
                          <span className="max-w-[6rem] truncate" title={t.name}>
                            {t.name}
                          </span>
                          <span className="text-[11px] text-subtle tabular-nums">
                            {s.done}/{s.total}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-hover">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface text-left font-normal px-3 py-2 border-b border-default min-w-[12rem]"
                    >
                      <Link
                        href={`/games/${game.id}/review/m/${m.id}`}
                        className="hover:text-accent"
                      >
                        <span className="line-clamp-2">{m.title}</span>
                      </Link>
                      <span className="block text-[11px] text-subtle">
                        {m.points} pts
                      </span>
                    </th>
                    {teams.map((t) => {
                      const st = cellState(m, t.id);
                      const c = CELL[st] ?? CELL.locked;
                      return (
                        <td
                          key={t.id}
                          className="px-3 py-2 border-b border-l border-default text-center"
                        >
                          <span
                            className={`pill ${c.cls} w-7 h-7 !px-0 inline-flex items-center justify-center`}
                            title={c.label}
                          >
                            {c.icon}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
