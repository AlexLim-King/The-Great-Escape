"use client";

import { useState } from "react";
import { createMission } from "@/lib/gm-actions";

type Mission = { id: string; title: string };
type Team = { id: string; name: string; color: string };

export default function MissionForm({
  gameId,
  missions,
  teams,
}: {
  gameId: string;
  missions: Mission[];
  teams: Team[];
}) {
  const [submissionType, setSubmissionType] = useState<
    "text" | "photo" | "video"
  >("text");
  const [validationMode, setValidationMode] = useState<"auto" | "gm_judged">(
    "auto",
  );
  const [deadlineMode, setDeadlineMode] = useState<
    "none" | "absolute" | "relative_to_unlock" | "relative_to_game_start"
  >("none");
  const [assignmentMode, setAssignmentMode] = useState<"all" | "specific">(
    "all",
  );

  // Photo/video are GM-judged only
  const isMediaSubmission =
    submissionType === "photo" || submissionType === "video";
  const validationOptions = isMediaSubmission
    ? [{ value: "gm_judged", label: "GM judged" }]
    : [
        { value: "auto", label: "Auto (exact answer)" },
        { value: "gm_judged", label: "GM judged" },
      ];

  return (
    <form
      action={createMission}
      encType="multipart/form-data"
      className="space-y-4"
    >
      <input type="hidden" name="game_id" value={gameId} />

      <label className="block">
        <span className="text-sm">Title</span>
        <input
          name="title"
          required
          className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Description / clue</span>
        <textarea
          name="description"
          rows={3}
          className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Reference image (optional)</span>
        <input
          type="file"
          name="reference_image"
          accept="image/*"
          className="mt-1 block w-full text-sm"
        />
        <span className="block text-xs text-black/50 dark:text-white/50 mt-1">
          Players see this on the mission detail page — useful as a visual clue
          or context.
        </span>
      </label>

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
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Points</span>
          <input
            name="points"
            type="number"
            defaultValue={10}
            min={0}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Unlocks after</span>
          <select
            name="prerequisite_mission_id"
            defaultValue="none"
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          >
            <option value="none">— always available —</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
      </div>

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
                  <input type="checkbox" name="team_ids" value={t.id} />
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
              defaultValue={15}
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
            />
            <span className="block text-xs text-black/50 dark:text-white/50 mt-1">
              {deadlineMode === "relative_to_unlock"
                ? "Each team gets this much time once the mission unlocks for them."
                : "Counts down from the game's start time (or creation time if no start set)."}
            </span>
          </label>
        )}
      </fieldset>

      <button
        type="submit"
        className="rounded bg-foreground text-background px-4 py-2 font-medium"
      >
        Create mission
      </button>
    </form>
  );
}
