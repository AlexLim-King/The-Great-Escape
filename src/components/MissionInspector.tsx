"use client";

import { useRef } from "react";

export type InspectorMission = {
  id: string;
  title: string;
  description: string | null;
  points: number;
  submission_type: "text" | "photo" | "video";
  validation_mode: "auto" | "gm_judged";
  expected_answer: string | null;
  deadline_mode:
    | "absolute"
    | "relative_to_unlock"
    | "relative_to_game_start"
    | null;
  deadline_at: string | null;
  deadline_duration_sec: number | null;
  unlock_groups: string[][];
  unlock_after: string | null;
  reference_links: { label: string; url: string }[];
};

/**
 * Click-to-inspect popup for a mission's spec — opens on click of the
 * trigger (the mission title) and shows description, reference image,
 * scoring rules, validation mode, deadline config, etc.
 *
 * Uses the native <dialog> element so focus trap, ESC-to-close, and the
 * dimmed backdrop come for free without a library.
 */
export default function MissionInspector({
  mission,
  referenceImageUrl,
  missionTitleById,
}: {
  mission: InspectorMission;
  referenceImageUrl?: string | null;
  /** Map of mission id -> title; used to render names in unlock groups. */
  missionTitleById?: Record<string, string>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  const deadlineLabel = (() => {
    if (!mission.deadline_mode) return null;
    if (mission.deadline_mode === "absolute") {
      return mission.deadline_at
        ? `Until ${new Date(mission.deadline_at).toLocaleString()}`
        : "Absolute deadline";
    }
    const mins = Math.round((mission.deadline_duration_sec ?? 0) / 60);
    return mission.deadline_mode === "relative_to_unlock"
      ? `${mins} min once a team unlocks it`
      : `${mins} min from game start`;
  })();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="text-left underline-offset-2 hover:underline focus-visible:underline focus:outline-none"
        title="View mission requirements"
      >
        {mission.title}
      </button>

      <dialog
        ref={dialogRef}
        // Reset native dialog styling and use Tailwind to position the card.
        // The text-foreground here is critical: <dialog> in the top layer
        // gets a user-agent default `color: CanvasText` that doesn't
        // inherit from <body>, so without an explicit color all text
        // inside renders dark in dark mode (black-on-black). Setting it
        // on the dialog lets every descendant inherit cleanly.
        // backdrop:* targets the ::backdrop pseudo for the dimmed overlay.
        className="
          m-auto p-0 bg-transparent text-text
          backdrop:bg-black/50 backdrop:backdrop-blur-sm
          max-w-lg w-[calc(100%-2rem)]
          open:animate-in
        "
        onClick={(e) => {
          // Close when the click hits the backdrop (the dialog itself).
          // Clicks on the inner card stop here because the card is a child.
          if (e.target === dialogRef.current) close();
        }}
      >
        <div
          className="
            rounded-xl border border-default
            bg-surface shadow-2xl
            max-h-[85vh] overflow-y-auto
          "
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-default sticky top-0 bg-surface">
            <div>
              <p className="text-xs uppercase tracking-wider text-subtle font-medium">
                Mission spec
              </p>
              <h2 className="text-lg font-semibold mt-0.5">{mission.title}</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-text transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {referenceImageUrl && (
              <div>
                <p className="text-xs text-muted mb-1.5">Reference image</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  className="w-full max-h-72 object-contain rounded-md border border-default bg-surface-muted"
                />
              </div>
            )}

            {mission.description ? (
              <div>
                <p className="text-xs text-muted mb-1">Description / clue</p>
                <p className="text-sm whitespace-pre-wrap">
                  {mission.description}
                </p>
              </div>
            ) : (
              <p className="text-sm italic text-subtle">No description.</p>
            )}

            {mission.reference_links.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-1.5">Reference links</p>
                <ul className="flex flex-wrap gap-1.5">
                  {mission.reference_links.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-strong px-2 py-1 text-xs hover:bg-surface-hover transition-colors"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Points</dt>
              <dd className="font-mono">{mission.points}</dd>

              <dt className="text-muted">Submission</dt>
              <dd>{mission.submission_type}</dd>

              <dt className="text-muted">Validation</dt>
              <dd>
                {mission.validation_mode === "auto"
                  ? "Auto (exact answer)"
                  : "GM-judged"}
              </dd>

              {mission.validation_mode === "auto" &&
                mission.submission_type === "text" &&
                mission.expected_answer && (
                  <>
                    <dt className="text-muted">Expected answer</dt>
                    <dd className="font-mono break-all">
                      {mission.expected_answer}
                    </dd>
                  </>
                )}

              {(mission.unlock_groups.length > 0 || mission.unlock_after) && (
                <>
                  <dt className="text-muted">Unlocks</dt>
                  <dd>
                    {mission.unlock_after && (
                      <p className="text-warn">
                        🕒 not before{" "}
                        {new Date(mission.unlock_after).toLocaleString()}
                      </p>
                    )}
                    {mission.unlock_groups.length === 0 ? (
                      mission.unlock_after && (
                        <p className="text-muted text-xs mt-0.5">
                          Available immediately at that time.
                        </p>
                      )
                    ) : (
                      <ul className="space-y-1 mt-0.5">
                        {mission.unlock_groups.map((group, gi) => (
                          <li key={gi} className="text-sm">
                            <span className="text-muted">
                              {gi === 0 ? "after " : "or after "}
                            </span>
                            {group.length === 0 ? (
                              <em className="text-subtle">(empty group)</em>
                            ) : (
                              group.map((mid, mi) => (
                                <span key={mid}>
                                  {mi > 0 && (
                                    <span className="text-subtle">
                                      {" + "}
                                    </span>
                                  )}
                                  <span className="italic">
                                    {missionTitleById?.[mid] ?? "?"}
                                  </span>
                                </span>
                              ))
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </>
              )}

              {deadlineLabel && (
                <>
                  <dt className="text-muted">Deadline</dt>
                  <dd className="text-warn">{deadlineLabel}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-default bg-surface-muted flex justify-end">
            <button
              type="button"
              onClick={close}
              className="btn btn-secondary btn-sm"
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
