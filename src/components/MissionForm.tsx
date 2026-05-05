"use client";

import { useState } from "react";
import { createMission } from "@/lib/gm-actions";

type Mission = { id: string; title: string };

export default function MissionForm({
  gameId,
  missions,
}: {
  gameId: string;
  missions: Mission[];
}) {
  const [submissionType, setSubmissionType] = useState<"text" | "photo">("text");
  const [validationMode, setValidationMode] = useState<"auto" | "gm_judged">(
    "auto",
  );
  const [deadlineMode, setDeadlineMode] = useState<
    "none" | "absolute" | "relative_to_unlock" | "relative_to_game_start"
  >("none");

  // Photo + auto is invalid; force gm_judged when photo selected
  const validationOptions =
    submissionType === "photo"
      ? [{ value: "gm_judged", label: "GM judged" }]
      : [
          { value: "auto", label: "Auto (exact answer)" },
          { value: "gm_judged", label: "GM judged" },
        ];

  return (
    <form action={createMission} className="space-y-4">
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

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Submission type</span>
          <select
            name="submission_type"
            value={submissionType}
            onChange={(e) => {
              const v = e.target.value as "text" | "photo";
              setSubmissionType(v);
              if (v === "photo") setValidationMode("gm_judged");
            }}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          >
            <option value="text">Text</option>
            <option value="photo">Photo</option>
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

      {/* Deadline section */}
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
