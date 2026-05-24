import type { ReactNode } from "react";
import {
  judgeSubmission,
  updateSubmissionBonus,
  discardSubmission,
} from "@/lib/gm-actions";

export type ReviewSubmission = {
  id: string;
  status: string;
  payload_text: string | null;
  media_path: string | null;
  /** Signed URL for the media, if any. */
  mediaUrl: string | null;
  submission_type: "text" | "photo" | "video";
  bonus_points: number;
  feedback: string | null;
  created_at: string;
  submitterName: string | null;
  teamName: string;
  teamColor: string;
};

/**
 * One submission with full judging controls (approve / reject / feedback /
 * bonus / discard). Shared by both review surfaces:
 *  - the "By Status" queue (passes a `missionHeader` so you can see which
 *    mission each row belongs to), and
 *  - the per-mission comparison page (mission is fixed and shown above, so
 *    no header is passed).
 *
 * `redirectTo` is the same-origin path the judging action returns to after
 * the mutation, so you stay on whichever surface you started from.
 */
export default function SubmissionReviewCard({
  submission: s,
  missionPoints,
  gameId,
  redirectTo,
  missionHeader,
}: {
  submission: ReviewSubmission;
  missionPoints: number;
  gameId: string;
  redirectTo: string;
  missionHeader?: ReactNode;
}) {
  const isPending = s.status === "pending";
  const isApproved = s.status === "approved";
  const isRejected = s.status === "rejected";

  const statusPill = isPending
    ? { label: "Pending", cls: "pill pill-warn" }
    : isApproved
      ? { label: "Approved", cls: "pill pill-success" }
      : isRejected
        ? { label: "Rejected", cls: "pill pill-danger" }
        : { label: s.status, cls: "pill pill-neutral" };

  return (
    <li className="card card-compact space-y-2">
      {/* Header: team (+ optional mission), status pill, timestamp */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-sm">
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: s.teamColor }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: s.teamColor }}
              aria-hidden
            />
            <span className="font-medium">{s.teamName}</span>
          </span>
          {missionHeader && (
            <>
              <span className="text-subtle">{" → "}</span>
              {missionHeader}
            </>
          )}
          <span className="text-xs text-subtle ml-2">
            {missionPoints} pts base
          </span>
          {s.submitterName && (
            <span className="block text-xs text-muted mt-0.5">
              submitted by{" "}
              <span className="font-medium">{s.submitterName}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={statusPill.cls}>{statusPill.label}</span>
          <span className="text-subtle">
            {new Date(s.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Payload */}
      {s.payload_text && (
        <p className="text-sm bg-surface-muted rounded-md p-2 whitespace-pre-wrap">
          {s.payload_text}
        </p>
      )}

      {s.media_path && s.mediaUrl && (
        <div>
          {s.submission_type === "video" ? (
            <video
              src={s.mediaUrl}
              controls
              className="max-h-72 rounded-md border border-default"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={s.mediaUrl}
              alt="Submission"
              className="max-h-72 rounded-md border border-default"
            />
          )}
        </div>
      )}

      {/* Existing feedback (visible on approved/rejected rows) */}
      {!isPending && s.feedback && (
        <p className="text-xs text-muted italic border-l-2 border-strong pl-2">
          “{s.feedback}”
        </p>
      )}

      {/* Approved: total + bonus edit + rejudge-to-rejected */}
      {isApproved && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-sm">
            <span className="text-muted">Score:</span>{" "}
            <span className="font-mono font-semibold">
              {missionPoints + s.bonus_points}
            </span>
            <span className="text-subtle text-xs">
              {" "}
              ({missionPoints}
              {s.bonus_points > 0 ? ` + ${s.bonus_points} bonus` : ""})
            </span>
          </span>

          <form
            action={updateSubmissionBonus}
            className="flex items-center gap-2 ml-auto"
          >
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <label className="text-xs text-muted">Bonus</label>
            <input
              name="bonus_points"
              type="number"
              min={0}
              defaultValue={s.bonus_points}
              className="input w-16 px-2 py-1 text-sm font-mono"
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Save
            </button>
          </form>

          <form action={judgeSubmission}>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <input type="hidden" name="decision" value="rejected" />
            <button type="submit" className="text-xs text-danger hover:underline">
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
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <input
              name="feedback"
              defaultValue={s.feedback ?? ""}
              placeholder="Feedback (optional)"
              className="input flex-1 min-w-[12rem]"
            />
            <input
              name="bonus_points"
              type="number"
              min={0}
              defaultValue={0}
              title="Bonus points"
              className="input w-16 px-2 py-1.5 text-sm font-mono"
            />
            <button
              type="submit"
              name="decision"
              value="approved"
              className="btn btn-sm"
              style={{ background: "var(--color-success)", color: "white" }}
            >
              Re-approve
            </button>
          </form>

          <form action={discardSubmission}>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <button
              type="submit"
              title="Delete this rejected submission. The team can submit again."
              className="btn btn-secondary btn-sm"
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
          <input type="hidden" name="game_id" value={gameId} />
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <input
            name="feedback"
            placeholder="Feedback (optional)"
            className="input flex-1 min-w-[12rem]"
          />
          <label className="text-xs text-muted flex items-center gap-1.5">
            Bonus
            <input
              name="bonus_points"
              type="number"
              min={0}
              defaultValue={0}
              className="input w-16 px-2 py-1 text-sm font-mono"
            />
          </label>
          <button
            type="submit"
            name="decision"
            value="approved"
            className="btn btn-sm"
            style={{ background: "var(--color-success)", color: "white" }}
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            className="btn btn-danger btn-sm"
          >
            Reject
          </button>
        </form>
      )}
    </li>
  );
}
