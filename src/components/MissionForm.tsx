"use client";

import { useState } from "react";
import UnlockEditor from "./UnlockEditor";
import ReferenceLinksEditor, {
  type ReferenceLink,
} from "./ReferenceLinksEditor";

type Mission = { id: string; title: string };
type Team = { id: string; name: string; color: string };

export type MissionInitial = {
  title: string;
  description: string | null;
  points: number;
  submission_type: "text" | "photo" | "video";
  validation_mode: "auto" | "gm_judged";
  expected_answer: string | null;
  /** Boolean unlock spec in disjunctive normal form. */
  unlock_groups: string[][];
  /** ISO-8601 timestamp; mission stays locked until this wall-clock time. */
  unlock_after: string | null;
  /** External reference URLs shown to players on the mission detail page. */
  reference_links: ReferenceLink[];
  assignment_mode: "all" | "specific";
  deadline_mode:
    | "absolute"
    | "relative_to_unlock"
    | "relative_to_game_start"
    | null;
  /** ISO-8601 string from DB (timestamptz). */
  deadline_at: string | null;
  deadline_duration_sec: number | null;
};

type Props = {
  gameId: string;
  missions: Mission[];
  teams: Team[];
  /** Server action that consumes the FormData. */
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  /** Optional initial values; provided in edit mode. */
  initial?: MissionInitial;
  /** Pre-checked teams when assignment_mode is "specific". */
  initialTeamIds?: string[];
  /**
   * Edit mode only: signed URL of the existing reference image so the
   * GM can decide to keep / replace / remove it without re-uploading.
   */
  currentReferenceImageUrl?: string | null;
  /**
   * Edit mode only: the mission being edited. Excluded from the
   * prerequisite dropdown (a mission can't depend on itself) and
   * forwarded to the action via a hidden input.
   */
  missionId?: string;
};

/** Convert a UTC ISO string to the local "YYYY-MM-DDTHH:mm" format the
    HTML datetime-local input expects. */
function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function MissionForm({
  gameId,
  missions,
  teams,
  action,
  submitLabel,
  initial,
  initialTeamIds,
  currentReferenceImageUrl,
  missionId,
}: Props) {
  const isEdit = !!missionId;

  const [submissionType, setSubmissionType] = useState<
    "text" | "photo" | "video"
  >(initial?.submission_type ?? "text");
  const [validationMode, setValidationMode] = useState<"auto" | "gm_judged">(
    initial?.validation_mode ?? "auto",
  );
  const [deadlineMode, setDeadlineMode] = useState<
    "none" | "absolute" | "relative_to_unlock" | "relative_to_game_start"
  >(initial?.deadline_mode ?? "none");
  const [assignmentMode, setAssignmentMode] = useState<"all" | "specific">(
    initial?.assignment_mode ?? "all",
  );

  // In edit mode, the GM can keep / replace / remove the reference image.
  const [refImageMode, setRefImageMode] = useState<
    "keep" | "replace" | "remove"
  >(currentReferenceImageUrl ? "keep" : "replace");

  // Photo/video are GM-judged only
  const isMediaSubmission =
    submissionType === "photo" || submissionType === "video";
  const validationOptions = isMediaSubmission
    ? [{ value: "gm_judged", label: "GM judged" }]
    : [
        { value: "auto", label: "Auto (exact answer)" },
        { value: "gm_judged", label: "GM judged" },
      ];

  const initialTeamIdSet = new Set(initialTeamIds ?? []);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="game_id" value={gameId} />
      {missionId && (
        <input type="hidden" name="mission_id" value={missionId} />
      )}

      <label className="block">
        <span className="text-sm">Title</span>
        <input
          name="title"
          required
          defaultValue={initial?.title ?? ""}
          className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Description / clue</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={initial?.description ?? ""}
          className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      {/* Reference image — slightly different UX in create vs edit */}
      {isEdit ? (
        <fieldset className="border border-black/10 dark:border-white/10 rounded p-3 space-y-3">
          <legend className="text-sm px-1">Reference image</legend>

          {currentReferenceImageUrl ? (
            <>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentReferenceImageUrl}
                  alt="Current reference"
                  className="w-20 h-20 object-cover rounded border border-black/10 dark:border-white/10 flex-none"
                />
                <p className="text-xs text-black/60 dark:text-white/60">
                  Current image
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reference_image_mode"
                    value="keep"
                    checked={refImageMode === "keep"}
                    onChange={() => setRefImageMode("keep")}
                  />
                  Keep current
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reference_image_mode"
                    value="replace"
                    checked={refImageMode === "replace"}
                    onChange={() => setRefImageMode("replace")}
                  />
                  Replace
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reference_image_mode"
                    value="remove"
                    checked={refImageMode === "remove"}
                    onChange={() => setRefImageMode("remove")}
                  />
                  Remove
                </label>
              </div>

              {refImageMode === "replace" && (
                <input
                  type="file"
                  name="reference_image"
                  accept="image/*"
                  required
                  className="block w-full text-sm"
                />
              )}
            </>
          ) : (
            <>
              <input
                type="hidden"
                name="reference_image_mode"
                value="replace"
              />
              <input
                type="file"
                name="reference_image"
                accept="image/*"
                className="block w-full text-sm"
              />
              <p className="text-xs text-black/50 dark:text-white/50">
                Players see this on the mission detail page — useful as a visual
                clue or context.
              </p>
            </>
          )}
        </fieldset>
      ) : (
        <label className="block">
          <span className="text-sm">Reference image (optional)</span>
          <input
            type="file"
            name="reference_image"
            accept="image/*"
            className="mt-1 block w-full text-sm"
          />
          <span className="block text-xs text-black/50 dark:text-white/50 mt-1">
            Players see this on the mission detail page — useful as a visual
            clue or context.
          </span>
        </label>
      )}

      <ReferenceLinksEditor initial={initial?.reference_links} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Submission type</span>
          <select
            name="submission_type"
            value={submissionType}
            onChange={(e) => {
              const v = e.target.value as "text" | "photo" | "video";
              setSubmissionType(v);
              if (v === "photo" || v === "video")
                setValidationMode("gm_judged");
            }}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          >
            <option value="text">Text</option>
            <option value="photo">Photo</option>
            <option value="video">Video</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Validation</span>
          <select
            name="validation_mode"
            value={validationMode}
            onChange={(e) =>
              setValidationMode(e.target.value as "auto" | "gm_judged")
            }
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          >
            {validationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {validationMode === "auto" && submissionType === "text" && (
        <label className="block">
          <span className="text-sm">Expected answer</span>
          <input
            name="expected_answer"
            defaultValue={initial?.expected_answer ?? ""}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>
      )}

      <label className="block max-w-[16rem]">
        <span className="text-sm">Points</span>
        <input
          name="points"
          type="number"
          defaultValue={initial?.points ?? 10}
          min={0}
          className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      {/* Unlock conditions: boolean DNF + optional time gate */}
      <UnlockEditor
        availableMissions={missions}
        excludeMissionId={missionId}
        initial={
          initial
            ? {
                unlock_groups: initial.unlock_groups,
                unlock_after: initial.unlock_after,
              }
            : undefined
        }
      />

      {/* Assignment */}
      <fieldset className="border border-black/10 dark:border-white/10 rounded p-3 space-y-3">
        <legend className="text-sm px-1">Assigned to</legend>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="assignment_mode"
              value="all"
              checked={assignmentMode === "all"}
              onChange={() => setAssignmentMode("all")}
            />
            All teams
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="assignment_mode"
              value="specific"
              checked={assignmentMode === "specific"}
              onChange={() => setAssignmentMode("specific")}
              disabled={teams.length === 0}
            />
            Specific teams
          </label>
        </div>

        {assignmentMode === "specific" && (
          <div className="space-y-1.5">
            {teams.length === 0 ? (
              <p className="text-xs text-black/60 dark:text-white/60">
                Create teams first before using specific-team assignment.
              </p>
            ) : (
              teams.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="team_ids"
                    value={t.id}
                    defaultChecked={initialTeamIdSet.has(t.id)}
                  />
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  {t.name}
                </label>
              ))
            )}
          </div>
        )}
      </fieldset>

      {/* Deadline */}
      <fieldset className="border border-black/10 dark:border-white/10 rounded p-3 space-y-3">
        <legend className="text-sm px-1">Deadline (optional)</legend>

        <label className="block">
          <span className="text-sm">Mode</span>
          <select
            name="deadline_mode"
            value={deadlineMode}
            onChange={(e) =>
              setDeadlineMode(
                e.target.value as
                  | "none"
                  | "absolute"
                  | "relative_to_unlock"
                  | "relative_to_game_start",
              )
            }
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          >
            <option value="none">No deadline</option>
            <option value="relative_to_unlock">
              Per-team timer (starts when team unlocks)
            </option>
            <option value="relative_to_game_start">
              From game start (same wall-clock for everyone)
            </option>
            <option value="absolute">Absolute date/time</option>
          </select>
        </label>

        {deadlineMode === "absolute" && (
          <label className="block">
            <span className="text-sm">Must complete before</span>
            <input
              type="datetime-local"
              name="deadline_at"
              required
              defaultValue={toLocalDatetimeInput(initial?.deadline_at)}
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </label>
        )}

        {(deadlineMode === "relative_to_unlock" ||
          deadlineMode === "relative_to_game_start") && (
          <label className="block">
            <span className="text-sm">Window (minutes)</span>
            <input
              type="number"
              name="deadline_duration_min"
              min={1}
              required
              defaultValue={
                initial?.deadline_duration_sec
                  ? Math.round(initial.deadline_duration_sec / 60)
                  : 15
              }
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
            />
            <span className="block text-xs text-black/50 dark:text-white/50 mt-1">
              {deadlineMode === "relative_to_unlock"
                ? "Each team gets this much time once the mission unlocks for them."
                : "Counts down from the game's start time (or creation time if no start set)."}
            </span>
          </label>
        )}

        {isEdit && (
          <p className="text-xs text-black/55 dark:text-white/55">
            Deadline changes apply to teams that haven&apos;t unlocked this
            mission yet. Teams with an active timer keep the original window
            so they aren&apos;t penalised mid-game.
          </p>
        )}
      </fieldset>

      <button
        type="submit"
        className="rounded bg-foreground text-background px-4 py-2 font-medium"
      >
        {submitLabel}
      </button>
    </form>
  );
}
