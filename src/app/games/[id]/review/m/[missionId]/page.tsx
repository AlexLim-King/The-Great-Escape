import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabNav from "@/components/TabNav";
import { gmTabs } from "@/lib/gm-tabs";
import MissionRequirements, {
  type RequirementsMission,
} from "@/components/MissionRequirements";
import SubmissionReviewCard, {
  type ReviewSubmission,
} from "@/components/SubmissionReviewCard";

function one<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Pending first (oldest-first for FIFO judging), then everything else
// newest-first.
function reviewOrder(a: { status: string; created_at: string }, b: {
  status: string;
  created_at: string;
}): number {
  const aPending = a.status === "pending" ? 0 : 1;
  const bPending = b.status === "pending" ? 0 : 1;
  if (aPending !== bPending) return aPending - bPending;
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  return aPending === 0 ? at - bt : bt - at;
}

export default async function MissionReviewPage(
  props: PageProps<"/games/[id]/review/m/[missionId]">,
) {
  const { id, missionId } = await props.params;

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

  // Keep state fresh (time gates / expiries) before reading.
  await supabase.rpc("refresh_game_state", { p_game_id: id });

  const { data: mission } = await supabase
    .from("missions")
    .select(
      "id, game_id, title, description, points, submission_type, validation_mode, expected_answer, reference_links, reference_image_path, deadline_mode, deadline_at, deadline_duration_sec",
    )
    .eq("id", missionId)
    .single();
  if (!mission || mission.game_id !== id) notFound();

  // Sign the reference image (1h TTL) for the requirements panel.
  let referenceImageUrl: string | null = null;
  if (mission.reference_image_path) {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(mission.reference_image_path, 60 * 60);
    referenceImageUrl = data?.signedUrl ?? null;
  }

  // Every team's submission for this mission.
  const { data: rawSubs } = await supabase
    .from("submissions")
    .select(
      "id, status, payload_text, media_path, bonus_points, feedback, created_at, submitted_by, teams!inner(name, color)",
    )
    .eq("mission_id", missionId);

  const subs = (rawSubs ?? []).slice().sort(reviewOrder);

  const counts = {
    pending: subs.filter((s) => s.status === "pending").length,
    approved: subs.filter((s) => s.status === "approved").length,
    rejected: subs.filter((s) => s.status === "rejected").length,
  };

  // Sign media for every submission shown.
  const mediaUrls = new Map<string, string>();
  for (const s of subs) {
    if (s.media_path) {
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(s.media_path, 60 * 60);
      if (data?.signedUrl) mediaUrls.set(s.id, data.signedUrl);
    }
  }

  // Submitter display names.
  const submitterNames = new Map<string, string>();
  const submitterIds = Array.from(
    new Set(subs.map((s) => s.submitted_by).filter(Boolean)),
  ) as string[];
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", submitterIds);
    for (const p of profiles ?? []) submitterNames.set(p.id, p.display_name);
  }

  const submission_type =
    mission.submission_type as ReviewSubmission["submission_type"];

  const rows: ReviewSubmission[] = subs.map((s) => {
    const team = one(s.teams)!;
    return {
      id: s.id,
      status: s.status,
      payload_text: s.payload_text,
      media_path: s.media_path,
      mediaUrl: mediaUrls.get(s.id) ?? null,
      submission_type,
      bonus_points: s.bonus_points,
      feedback: s.feedback,
      created_at: s.created_at,
      submitterName: s.submitted_by
        ? (submitterNames.get(s.submitted_by) ?? null)
        : null,
      teamName: team.name,
      teamColor: team.color,
    };
  });

  const requirementsMission: RequirementsMission = {
    title: mission.title,
    description: mission.description,
    points: mission.points,
    submission_type,
    validation_mode:
      mission.validation_mode as RequirementsMission["validation_mode"],
    expected_answer: mission.expected_answer,
    reference_links: (mission.reference_links ?? []) as {
      label: string;
      url: string;
    }[],
    deadline_mode:
      mission.deadline_mode as RequirementsMission["deadline_mode"],
    deadline_at: mission.deadline_at,
    deadline_duration_sec: mission.deadline_duration_sec,
  };

  // Judging actions return here so you stay on the comparison view.
  const returnPath = `/games/${game.id}/review/m/${mission.id}`;

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
      <header>
        <Link
          href={`/games/${game.id}/review`}
          className="text-sm text-muted hover:text-text"
        >
          ← All missions
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {mission.title}
        </h1>
        <p className="text-sm text-muted mt-1">
          {game.name} · {subs.length}{" "}
          {subs.length === 1 ? "submission" : "submissions"}
          {counts.pending > 0 && (
            <span className="ml-2 pill pill-warn">
              {counts.pending} to review
            </span>
          )}
        </p>
      </header>

      <TabNav current="Review" tabs={gmTabs(game.id, counts.pending)} />

      {/* Requirements pinned above all teams' submissions */}
      <MissionRequirements
        mission={requirementsMission}
        referenceImageUrl={referenceImageUrl}
      />

      {/* All teams' submissions for this mission */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Submissions by team
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            No team has submitted this mission yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <SubmissionReviewCard
                key={row.id}
                submission={row}
                missionPoints={mission.points}
                gameId={game.id}
                redirectTo={returnPath}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
