import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  judgeSubmission,
  updateSubmissionBonus,
  discardSubmission,
} from "@/lib/gm-actions";
import TabNav from "@/components/TabNav";
import MissionInspector from "@/components/MissionInspector";

type ReviewTab = "pending" | "approved" | "rejected" | "all";
const REVIEW_TABS: Array<{ value: ReviewTab; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function ReviewPage(
  props: PageProps<"/games/[id]/review">,
) {
  const { id } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tabValue = (Array.isArray(rawTab) ? rawTab[0] : rawTab) ?? "pending";
  const tab: ReviewTab = (
    REVIEW_TABS.some((t) => t.value === tabValue) ? tabValue : "pending"
  ) as ReviewTab;

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

  // Lazy refresh: expire overdue + recompute every team's unlocks so
  // time gates and newly-satisfied DNF groups are reflected in counts
  // and badges before we render.
  await supabase.rpc("refresh_game_state", { p_game_id: id });

  // All submissions for this game (we tab/filter in-memory below).
  // The missions!inner join carries the full mission spec so the per-row
  // <MissionInspector> popup has everything it needs without a refetch.
  const { data: allSubmissions } = await supabase
    .from("submissions")
    .select(
      "id, status, payload_text, media_path, bonus_points, feedback, created_at, verified_at, mission_id, team_id, submitted_by, missions!inner(id, title, game_id, points, submission_type, description, validation_mode, expected_answer, unlock_groups, unlock_after, deadline_mode, deadline_at, deadline_duration_sec, reference_image_path), teams!inner(name, color)",
    )
    .eq("missions.game_id", id)
    .order("created_at", { ascending: false });

  const subs = allSubmissions ?? [];
  const counts = {
    pending: subs.filter((s) => s.status === "pending").length,
    approved: subs.filter((s) => s.status === "approved").length,
    rejected: subs.filter((s) => s.status === "rejected").length,
    all: subs.length,
  };
  const visible =
    tab === "all" ? subs : subs.filter((s) => s.status === tab);

  // Sort pending oldest-first (FIFO judging) but everything else newest-first
  if (tab === "pending") {
    visible.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  // Generate signed URLs for any media in the visible set
  const signedUrls = new Map<string, string>();
  for (const s of visible) {
    if (s.media_path) {
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(s.media_path, 60 * 60);
      if (data?.signedUrl) signedUrls.set(s.id, data.signedUrl);
    }
  }

  // Reference image signed URLs (deduped per mission so a busy mission
  // doesn't sign the same path 20 times).
  const referenceUrls = new Map<string, string>();
  const seenMissionRefs = new Set<string>();
  for (const s of visible) {
    const m = Array.isArray(s.missions) ? s.missions[0] : s.missions;
    if (m?.id && m.reference_image_path && !seenMissionRefs.has(m.id)) {
      seenMissionRefs.add(m.id);
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(m.reference_image_path, 60 * 60);
      if (data?.signedUrl) referenceUrls.set(m.id, data.signedUrl);
    }
  }

  // Title lookup for the inspector's unlock-groups display. We pull every
  // mission in the game (cheap; bounded by mission count) so referenced
  // prereqs are resolvable even if they aren't in the visible set.
  const { data: gameMissions } = await supabase
    .from("missions")
    .select("id, title")
    .eq("game_id", id);
  const missionTitleById: Record<string, string> = Object.fromEntries(
    (gameMissions ?? []).map((m) => [m.id, m.title]),
  );

  // Look up submitter display names for the visible set
  const submitterNames = new Map<string, string>();
  const submitterIds = Array.from(
    new Set(visible.map((s) => s.submitted_by).filter(Boolean)),
  ) as string[];
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", submitterIds);
    for (const p of profiles ?? []) {
      submitterNames.set(p.id, p.display_name);
    }
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
      {/* Header */}
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
        current="Review"
        tabs={[
          { label: "Setup", href: `/games/${game.id}` },
          {
            label: "Review",
            href: `/games/${game.id}/review`,
            badge: counts.pending,
            badgeTone: "warn",
          },
          { label: "Leaderboard", href: `/games/${game.id}/leaderboard` },
        ]}
      />

      {/* Review section */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Submissions</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-black/10 dark:border-white/10 -mx-1 overflow-x-auto">
          {REVIEW_TABS.map((t) => {
            const isActive = tab === t.value;
            const count = counts[t.value];
            return (
              <Link
                key={t.value}
                href={`/games/${game.id}/review?tab=${t.value}`}
                className={`px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-foreground font-medium"
                    : "border-transparent text-black/60 dark:text-white/60 hover:text-foreground"
                }`}
              >
                {t.label}{" "}
                <span
                  className={`text-xs ${isActive ? "" : "text-black/40 dark:text-white/40"}`}
                >
                  ({count})
                </span>
              </Link>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            {tab === "pending"
              ? "Inbox zero — no submissions awaiting review."
              : tab === "all"
                ? "No submissions yet."
                : `No ${tab} submissions.`}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((s) => {
              const mission = Array.isArray(s.missions)
                ? s.missions[0]
                : s.missions;
              const team = Array.isArray(s.teams) ? s.teams[0] : s.teams;
              const isPending = s.status === "pending";
              const isApproved = s.status === "approved";
              const isRejected = s.status === "rejected";

              const statusPill = isPending
                ? {
                    label: "Pending",
                    cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                  }
                : isApproved
                  ? {
                      label: "Approved",
                      cls: "bg-green-600/20 text-green-700 dark:text-green-300",
                    }
                  : isRejected
                    ? {
                        label: "Rejected",
                        cls: "bg-red-600/20 text-red-700 dark:text-red-300",
                      }
                    : {
                        label: s.status,
                        cls: "bg-black/10 dark:bg-white/10",
                      };

              return (
                <li
                  key={s.id}
                  className="rounded border border-black/10 dark:border-white/10 p-3 space-y-2"
                >
                  {/* Header: team -> mission, status pill, timestamp */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="text-sm">
                      <span
                        className="inline-flex items-center gap-1.5"
                        style={{ color: team?.color }}
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: team?.color }}
                          aria-hidden
                        />
                        <span className="font-medium">{team?.name}</span>
                      </span>
                      <span className="text-black/40 dark:text-white/40">
                        {" → "}
                      </span>
                      {mission ? (
                        <MissionInspector
                          mission={{
                            ...mission,
                            unlock_groups: (mission.unlock_groups ?? []) as string[][],
                          }}
                          referenceImageUrl={referenceUrls.get(mission.id)}
                          missionTitleById={missionTitleById}
                        />
                      ) : (
                        <span>?</span>
                      )}
                      <span className="text-xs text-black/50 dark:text-white/50 ml-2">
                        {mission?.points} pts base
                      </span>
                      {s.submitted_by && submitterNames.get(s.submitted_by) && (
                        <span className="block text-xs text-black/55 dark:text-white/55 mt-0.5">
                          submitted by{" "}
                          <span className="font-medium">
                            {submitterNames.get(s.submitted_by)}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded px-2 py-0.5 ${statusPill.cls}`}
                      >
                        {statusPill.label}
                      </span>
                      <span className="text-black/50 dark:text-white/50">
                        {new Date(s.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Payload */}
                  {s.payload_text && (
                    <p className="text-sm bg-black/5 dark:bg-white/5 rounded p-2 whitespace-pre-wrap">
                      {s.payload_text}
                    </p>
                  )}

                  {s.media_path && signedUrls.get(s.id) && (
                    <div>
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

                  {/* Existing feedback (visible on approved/rejected rows) */}
                  {!isPending && s.feedback && (
                    <p className="text-xs text-black/60 dark:text-white/60 italic border-l-2 border-black/15 dark:border-white/15 pl-2">
                      “{s.feedback}”
                    </p>
                  )}

                  {/* Approved: total + bonus edit + rejudge-to-rejected */}
                  {isApproved && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <span className="text-sm">
                        <span className="text-black/60 dark:text-white/60">
                          Score:
                        </span>{" "}
                        <span className="font-mono font-semibold">
                          {(mission?.points ?? 0) + s.bonus_points}
                        </span>
                        <span className="text-black/50 dark:text-white/50 text-xs">
                          {" "}
                          ({mission?.points ?? 0}
                          {s.bonus_points > 0
                            ? ` + ${s.bonus_points} bonus`
                            : ""}
                          )
                        </span>
                      </span>

                      <form
                        action={updateSubmissionBonus}
                        className="flex items-center gap-2 ml-auto"
                      >
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="game_id"
                          value={game.id}
                        />
                        <input type="hidden" name="tab" value={tab} />
                        <label className="text-xs text-black/60 dark:text-white/60">
                          Bonus
                        </label>
                        <input
                          name="bonus_points"
                          type="number"
                          min={0}
                          defaultValue={s.bonus_points}
                          className="w-16 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-sm font-mono"
                        />
                        <button
                          type="submit"
                          className="text-xs rounded border border-black/15 dark:border-white/15 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          Save
                        </button>
                      </form>

                      <form action={judgeSubmission}>
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="game_id"
                          value={game.id}
                        />
                        <input type="hidden" name="tab" value={tab} />
                        <input
                          type="hidden"
                          name="decision"
                          value="rejected"
                        />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          Mark rejected
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Rejected: re-approve form + Discard */}
                  {isRejected && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <form
                        action={judgeSubmission}
                        className="flex flex-wrap items-center gap-2 flex-1 min-w-[18rem]"
                      >
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="game_id"
                          value={game.id}
                        />
                        <input type="hidden" name="tab" value={tab} />
                        <input
                          name="feedback"
                          defaultValue={s.feedback ?? ""}
                          placeholder="Feedback (optional)"
                          className="rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 flex-1 min-w-[12rem] text-sm"
                        />
                        <input
                          name="bonus_points"
                          type="number"
                          min={0}
                          defaultValue={0}
                          title="Bonus points"
                          className="w-16 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm font-mono"
                        />
                        <button
                          type="submit"
                          name="decision"
                          value="approved"
                          className="rounded bg-green-600 text-white px-3 py-1.5 text-sm"
                        >
                          Re-approve
                        </button>
                      </form>

                      <form action={discardSubmission}>
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="game_id"
                          value={game.id}
                        />
                        <input type="hidden" name="tab" value={tab} />
                        <button
                          type="submit"
                          title="Delete this rejected submission. The team can submit again."
                          className="rounded border border-black/15 dark:border-white/15 px-3 py-1.5 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          Discard
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Pending: full judge form */}
                  {isPending && (
                    <form
                      action={judgeSubmission}
                      className="flex flex-wrap items-center gap-2 pt-1"
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="game_id" value={game.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input
                        name="feedback"
                        placeholder="Feedback (optional)"
                        className="rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 flex-1 min-w-[12rem] text-sm"
                      />
                      <label className="text-xs text-black/60 dark:text-white/60 flex items-center gap-1.5">
                        Bonus
                        <input
                          name="bonus_points"
                          type="number"
                          min={0}
                          defaultValue={0}
                          className="w-16 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-sm font-mono"
                        />
                      </label>
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
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
