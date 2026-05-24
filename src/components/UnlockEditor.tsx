"use client";

import { useState } from "react";

type Mission = { id: string; title: string };
type Mode = "always" | "custom";

export type UnlockEditorInitial = {
  unlock_groups: string[][];
  unlock_after: string | null; // ISO
};

/** Convert a UTC ISO string to the local "YYYY-MM-DDTHH:mm" format the
    HTML datetime-local input expects. */
function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Editor for boolean unlock expressions in disjunctive normal form (DNF):
 * a list of AND-groups; the mission unlocks when ANY group is satisfied.
 *
 * Wire format (serialized into hidden inputs):
 *   unlock_groups   stringified JSON: string[][] of mission UUIDs
 *   unlock_after    datetime-local string (or empty)
 *
 * Empty unlock_groups means "always available" (subject to the time gate).
 */
export default function UnlockEditor({
  availableMissions,
  excludeMissionId,
  initial,
}: {
  availableMissions: Mission[];
  /** When editing a mission, exclude its own id from the picker. */
  excludeMissionId?: string;
  initial?: UnlockEditorInitial;
}) {
  const visibleMissions = excludeMissionId
    ? availableMissions.filter((m) => m.id !== excludeMissionId)
    : availableMissions;

  const initialGroups = initial?.unlock_groups ?? [];
  const [mode, setMode] = useState<Mode>(
    initialGroups.length > 0 ? "custom" : "always",
  );
  // Always keep groups in state; "always" mode just doesn't render them
  // and submits an empty array.
  const [groups, setGroups] = useState<string[][]>(initialGroups);

  const [hasTimeGate, setHasTimeGate] = useState<boolean>(
    !!initial?.unlock_after,
  );
  const [unlockAfter, setUnlockAfter] = useState<string>(
    toLocalDatetimeInput(initial?.unlock_after),
  );

  function toggleMissionInGroup(groupIdx: number, missionId: string) {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIdx) return g;
        return g.includes(missionId)
          ? g.filter((id) => id !== missionId)
          : [...g, missionId];
      }),
    );
  }

  function addGroup() {
    setGroups((prev) => [...prev, []]);
  }

  function removeGroup(idx: number) {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickMode(m: Mode) {
    setMode(m);
    // Seed an empty group when entering custom mode so the user has
    // something to fill in immediately.
    if (m === "custom" && groups.length === 0) {
      setGroups([[]]);
    }
  }

  // What we submit. Empty groups when in "always" mode.
  const submittedGroups = mode === "custom" ? groups : [];

  return (
    <fieldset className="border border-default rounded-lg p-3 space-y-3">
      <legend className="text-sm px-1">Unlock conditions</legend>

      <input
        type="hidden"
        name="unlock_groups"
        value={JSON.stringify(submittedGroups)}
      />
      <input
        type="hidden"
        name="unlock_after"
        value={hasTimeGate ? unlockAfter : ""}
      />

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "always"}
            onChange={() => pickMode("always")}
          />
          Always available
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "custom"}
            onChange={() => pickMode("custom")}
            disabled={visibleMissions.length === 0}
          />
          Requires other missions
        </label>
      </div>

      {mode === "custom" && (
        <>
          {visibleMissions.length === 0 ? (
            <p className="text-xs text-muted">
              Create more missions before adding unlock conditions.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-default p-2.5 space-y-1.5 bg-surface-muted"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      {idx === 0
                        ? "When all of these are completed:"
                        : "…or all of these:"}
                    </p>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeGroup(idx)}
                        className="text-xs text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {visibleMissions.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={group.includes(m.id)}
                          onChange={() => toggleMissionInGroup(idx, m.id)}
                        />
                        {m.title}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addGroup}
                className="btn btn-secondary btn-sm"
              >
                + Add alternative
              </button>
              {groups.length > 1 && (
                <p className="text-xs text-muted">
                  Mission unlocks when <strong>any</strong> group is fully
                  satisfied.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <div className="border-t border-default pt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasTimeGate}
            onChange={(e) => setHasTimeGate(e.target.checked)}
          />
          Don&apos;t unlock before a specific time
        </label>
        {hasTimeGate && (
          <>
            <input
              type="datetime-local"
              value={unlockAfter}
              onChange={(e) => setUnlockAfter(e.target.value)}
              required
              className="input"
            />
            <p className="text-xs text-muted">
              The mission stays locked until this time even if all unlock
              conditions are already satisfied.
            </p>
          </>
        )}
      </div>
    </fieldset>
  );
}
