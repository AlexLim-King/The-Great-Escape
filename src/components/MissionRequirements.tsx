export type RequirementsMission = {
  title: string;
  description: string | null;
  points: number;
  submission_type: "text" | "photo" | "video";
  validation_mode: "auto" | "gm_judged";
  expected_answer: string | null;
  reference_links: { label: string; url: string }[];
  deadline_mode:
    | "absolute"
    | "relative_to_unlock"
    | "relative_to_game_start"
    | null;
  deadline_at: string | null;
  deadline_duration_sec: number | null;
};

/**
 * Pinned "requirements" panel shown above a mission's submissions on the
 * per-mission comparison page, so the GM can judge every team against the
 * same brief without opening a popup.
 */
export default function MissionRequirements({
  mission,
  referenceImageUrl,
}: {
  mission: RequirementsMission;
  referenceImageUrl?: string | null;
}) {
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
    <section className="card space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill pill-accent uppercase tracking-wider">
          Requirements
        </span>
        <span className="pill pill-neutral">{mission.points} pts</span>
        <span className="pill pill-neutral">{mission.submission_type}</span>
        <span className="pill pill-neutral">
          {mission.validation_mode === "auto" ? "Auto-checked" : "GM-judged"}
        </span>
        {deadlineLabel && (
          <span className="pill pill-warn">⏱ {deadlineLabel}</span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {referenceImageUrl && (
          <div className="sm:w-48 flex-none">
            <p className="text-xs text-muted mb-1.5">Reference image</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referenceImageUrl}
              alt="Reference"
              className="w-full max-h-48 object-contain rounded-md border border-default bg-surface-muted"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <p className="text-xs text-muted mb-1">Description / clue</p>
            {mission.description ? (
              <p className="text-sm whitespace-pre-wrap">
                {mission.description}
              </p>
            ) : (
              <p className="text-sm italic text-subtle">No description.</p>
            )}
          </div>

          {mission.validation_mode === "auto" &&
            mission.submission_type === "text" &&
            mission.expected_answer && (
              <div>
                <p className="text-xs text-muted mb-1">Expected answer</p>
                <p className="text-sm font-mono break-all">
                  {mission.expected_answer}
                </p>
              </div>
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
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
