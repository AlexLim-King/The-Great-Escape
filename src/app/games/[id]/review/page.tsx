import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabNav from "@/components/TabNav";
import MissionInspector, {
  type InspectorMission,
} from "@/components/MissionInspector";
import AnnouncementComposer from "@/components/AnnouncementComposer";
import SubmissionReviewCard, {
  type ReviewSubmission,
} from "@/components/SubmissionReviewCard";

type ReviewView = "mission" | "status";
type StatusTab = "pending" | "approved" | "rejected" | "all";
const STATUS_TABS: Array<{ value: StatusTab; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const typeIcon: Record<string, string> = {
  text: "📝",
  photo: "📷",
  video: "🎬",
};

function one<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ReviewPage(
  props: PageProps<"/games/[id]/review">,
) {
  const { id } = await props.params;
  const sp = await props.searchParams;

  const viewRaw = one(sp.view);
  const view: ReviewView = viewRaw === "status" ? "status" : "mission";

  const tabRaw = one(sp.tab) ?? "pending";
  const tab: StatusTab = (
    STATUS_TABS.some((t) => t.value === tabRaw) ? tabRaw : "pending"
  ) as StatusTab;

  // Flash-message inputs from the broadcastAnnouncement redirect.
  const announceSentStr = one(sp.announce_sent);
  const announceSent =
    announceSentStr != null && /^\d+$/.test(announceSentStr)
      ? parseInt(announceSentStr, 10)
      : null;
  const announceError = one(sp.announce_error) ?? null;

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

  // Lazy refresh so time gates / expiries are reflected before we render.
  await supabase.rpc("refresh_game_state", { p_game_id: id });

  // All submissions for this game. The missions!inner join carries the
  // full mission spec for the per-row inspector and gallery aggregation.
  const { data: allSubmissions } = await supabase
    .from("submissions")
    .select(
      "id, status, payload_text, media_path, bonus_points, feedback, created_at, mission_id, team_id, submitted_by, missions!inner(id, title, game_id, points, submission_type, description, validation_mode, expected_answer, unlock_groups, unlock_after, reference_links, deadline_mode, deadline_at, deadline_duration_sec, reference_image_path), teams!inner(name, color)",
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

  // Full mission list (ordered) for the gallery + title lookups.
  const { data: missionsFull } = await supabase
    .from("missions")
    .select(
      "id, title, points, submission_type, reference_image_path, display_order, created_at",
    )
    .eq("game_id", id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  const missions = missionsFull ?? [];
  const missionTitleById: Record<string, string> = Object.fromEntries(
    missions.map((m) => [m.id, m.title]),
  );

  // Recipient count + recent announcements (shared header).
  const { data: gameTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("game_id", id);
  const gameTeamIds = (gameTeams ?? []).map((t) => t.id);
  let recipientCount = 0;
  if (gameTeamIds.length > 0) {
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .in("team_id", gameTeamIds);
    recipientCount = new Set((members ?? []).map((m) => m.user_id)).size;
  }

  const { data: announcementRows } = await supabase.rpc(
    "list_game_announcements",
    { p_game_id: id, p_limit: 10 },
  );
  const announcements = (announcementRows ?? []) as Array<{
    created_at: string;
    title: string;
    body: string | null;
    recipient_count: number;
  }>;

  // ── View-specific data ──────────────────────────────────────────────────
  type GalleryCard = {
    id: string;
    title: string;
    points: number;
    submission_type: string;
    total: number;
    pending: number;
    thumbUrl: string | null;
  };
  let gallery: GalleryCard[] = [];

  type StatusRow = ReviewSubmission & { missionId: string };
  let statusRows: StatusRow[] = [];
  const referenceUrls = new Map<string, string>(); // mission_id -> signed url

  if (view === "mission") {
    // Aggregate per mission: counts + a representative photo (latest photo
    // submission, else the mission's reference image, else a type icon).
    const agg = new Map<
      string,
      { total: number; pending: number; photoPath: string | null; photoAt: number }
    >();
    for (const m of missions) {
      agg.set(m.id, { total: 0, pending: 0, photoPath: null, photoAt: 0 });
    }
    for (const s of subs) {
      const a = agg.get(s.mission_id);
      if (!a) continue;
      a.total++;
      if (s.status === "pending") a.pending++;
      const sm = one(s.missions);
      if (s.media_path && sm?.submission_type === "photo") {
        const t = new Date(s.created_at).getTime();
        if (t > a.photoAt) {
          a.photoAt = t;
          a.photoPath = s.media_path;
        }
      }
    }

    // Sign one representative image per mission.
    const thumbUrls = new Map<string, string>();
    for (const m of missions) {
      const a = agg.get(m.id)!;
      const path = a.photoPath ?? m.reference_image_path ?? null;
      if (!path) continue;
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) thumbUrls.set(m.id, data.signedUrl);
    }

    gallery = missions.map((m) => {
      const a = agg.get(m.id)!;
      return {
        id: m.id,
        title: m.title,
        points: m.points,
        submission_type: m.submission_type,
        total: a.total,
        pending: a.pending,
        thumbUrl: thumbUrls.get(m.id) ?? null,
      };
    });
  } else {
    // Status queue (existing behavior): filter by tab, sign media, names.
    const visible =
      tab === "all" ? subs : subs.filter((s) => s.status === tab);
    if (tab === "pending") {
      visible.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }

    const mediaUrls = new Map<string, string>();
    for (const s of visible) {
      if (s.media_path) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(s.media_path, 60 * 60);
        if (data?.signedUrl) mediaUrls.set(s.id, data.signedUrl);
      }
    }

    // Reference images for the inspector (deduped per mission).
    const seen = new Set<string>();
    for (const s of visible) {
      const m = one(s.missions);
      if (m?.id && m.reference_image_path && !seen.has(m.id)) {
        seen.add(m.id);
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(m.reference_image_path, 60 * 60);
        if (data?.signedUrl) referenceUrls.set(m.id, data.signedUrl);
      }
    }

    const submitterNames = new Map<string, string>();
    const submitterIds = Array.from(
      new Set(visible.map((s) => s.submitted_by).filter(Boolean)),
    ) as string[];
    if (submitterIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", submitterIds);
      for (const p of profiles ?? []) submitterNames.set(p.id, p.display_name);
    }

    statusRows = visible.map((s) => {
      const m = one(s.missions)!;
      const team = one(s.teams)!;
      return {
        id: s.id,
        status: s.status,
        payload_text: s.payload_text,
        media_path: s.media_path,
        mediaUrl: mediaUrls.get(s.id) ?? null,
        submission_type: m.submission_type as ReviewSubmission["submission_type"],
        bonus_points: s.bonus_points,
        feedback: s.feedback,
        created_at: s.created_at,
        submitterName: s.submitted_by
          ? (submitterNames.get(s.submitted_by) ?? null)
          : null,
        teamName: team.name,
        teamColor: team.color,
        missionId: m.id,
      };
    });
  }

  // Map status rows back to their mission spec (for the inspector header).
  const missionById = new Map(subs.map((s) => [s.mission_id, one(s.missions)!]));

  const statusReturnPath = `/games/${game.id}/review?view=status&tab=${tab}`;

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <header>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {game.name}
        </h1>
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
          { label: "Settings", href: `/games/${game.id}/settings` },
        ]}
      />

      {/* Announcements: composer + recent history */}
      <section className="space-y-3">
        <AnnouncementComposer
          key={`compose-${announceSent ?? "fresh"}`}
          gameId={game.id}
          tab={view === "status" ? tab : ""}
          recipientCount={recipientCount}
          sent={announceSent}
          error={announceError}
        />

        {announcements.length > 0 && (
          <details className="rounded-lg border border-default bg-surface">
            <summary className="cursor-pointer px-4 py-2 text-sm text-muted hover:text-text select-none">
              Recent announcements ({announcements.length})
            </summary>
            <ul className="divide-y divide-[var(--color-border)]">
              {announcements.map((a) => (
                <li
                  key={a.created_at}
                  className="px-4 py-2.5 flex items-start gap-3"
                >
                  <span aria-hidden className="text-base mt-0.5">
                    📢
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.body && (
                      <p className="text-xs text-muted whitespace-pre-wrap">
                        {a.body}
                      </p>
                    )}
                    <p className="text-[11px] text-subtle mt-0.5">
                      {new Date(a.created_at).toLocaleString()} · sent to{" "}
                      {a.recipient_count}{" "}
                      {a.recipient_count === 1 ? "player" : "players"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Review section */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Submissions
          </h2>
          <p className="text-sm text-muted">
            {missions.length} missions · {counts.all} submissions
          </p>
        </div>

        {/* View toggle: By Mission (gallery) | By Status (queue) */}
        <div className="inline-flex rounded-lg border border-default p-0.5 bg-surface mb-5">
          <Link
            href={`/games/${game.id}/review?view=mission`}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "mission"
                ? "bg-accent text-accent-fg font-medium"
                : "text-muted hover:text-text"
            }`}
          >
            By Mission
          </Link>
          <Link
            href={`/games/${game.id}/review?view=status&tab=pending`}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "status"
                ? "bg-accent text-accent-fg font-medium"
                : "text-muted hover:text-text"
            }`}
          >
            By Status
            {counts.pending > 0 && (
              <span className="ml-1.5 pill pill-warn">{counts.pending}</span>
            )}
          </Link>
        </div>

        {/* ── By Mission: gallery grid ─────────────────────────────────── */}
        {view === "mission" &&
          (gallery.length === 0 ? (
            <p className="text-sm text-muted">
              No missions yet — add some on the Setup tab.
            </p>
          ) : (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {gallery.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/games/${game.id}/review/m/${m.id}`}
                    className="card !p-0 card-interactive block overflow-hidden h-full"
                  >
                    <div className="aspect-[4/3] bg-surface-muted flex items-center justify-center overflow-hidden">
                      {m.thumbUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.thumbUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl opacity-60" aria-hidden>
                          {typeIcon[m.submission_type] ?? "📋"}
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="font-semibold leading-snug line-clamp-2">
                        {m.title}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="pill pill-neutral">{m.points} PTS</span>
                        <span className="text-xs text-muted">
                          {m.total}{" "}
                          {m.total === 1 ? "submission" : "submissions"}
                        </span>
                      </div>
                      {m.pending > 0 && (
                        <span className="pill pill-warn">
                          {m.pending} to review
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {/* ── By Status: queue ─────────────────────────────────────────── */}
        {view === "status" && (
          <>
            <div className="flex gap-1 mb-4 border-b border-default -mx-1 overflow-x-auto">
              {STATUS_TABS.map((t) => {
                const isActive = tab === t.value;
                return (
                  <Link
                    key={t.value}
                    href={`/games/${game.id}/review?view=status&tab=${t.value}`}
                    className={`px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      isActive
                        ? "border-accent text-text font-medium"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {t.label}{" "}
                    <span
                      className={`text-xs ${isActive ? "" : "text-subtle"}`}
                    >
                      ({counts[t.value]})
                    </span>
                  </Link>
                );
              })}
            </div>

            {statusRows.length === 0 ? (
              <p className="text-sm text-muted">
                {tab === "pending"
                  ? "Inbox zero — no submissions awaiting review."
                  : tab === "all"
                    ? "No submissions yet."
                    : `No ${tab} submissions.`}
              </p>
            ) : (
              <ul className="space-y-3">
                {statusRows.map((row) => {
                  const m = missionById.get(row.missionId);
                  return (
                    <SubmissionReviewCard
                      key={row.id}
                      submission={row}
                      missionPoints={m?.points ?? 0}
                      gameId={game.id}
                      redirectTo={statusReturnPath}
                      missionHeader={
                        m ? (
                          <MissionInspector
                            mission={{
                              ...m,
                              submission_type:
                                m.submission_type as InspectorMission["submission_type"],
                              validation_mode:
                                m.validation_mode as InspectorMission["validation_mode"],
                              deadline_mode:
                                m.deadline_mode as InspectorMission["deadline_mode"],
                              unlock_groups: (m.unlock_groups ?? []) as string[][],
                              reference_links: (m.reference_links ??
                                []) as { label: string; url: string }[],
                            }}
                            referenceImageUrl={referenceUrls.get(m.id)}
                            missionTitleById={missionTitleById}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
