"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateGameSettings, type GameSettingsState } from "@/lib/gm-actions";

const initialState: GameSettingsState = {};
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
const LOCATION_MAX = 120;

export default function GameSettingsForm({
  gameId,
  initial,
}: {
  gameId: string;
  initial: {
    name: string;
    description: string;
    location: string;
    ends_at: string; // local "YYYY-MM-DDTHH:mm" or ""
    theme: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateGameSettings,
    initialState,
  );

  // After an error the action returns the just-typed values; otherwise fall
  // back to the persisted values passed in from the server.
  const v = state.values ?? initial;

  // Live char counters (inputs stay uncontrolled via defaultValue; we just
  // track lengths for the counter display).
  const [nameLen, setNameLen] = useState(v.name.length);
  const [descLen, setDescLen] = useState(v.description.length);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="game_id" value={gameId} />

      {state.error && <p className="banner banner-error">{state.error}</p>}

      <label className="block">
        <span className="text-sm">Name</span>
        <input
          name="name"
          required
          maxLength={NAME_MAX}
          defaultValue={v.name}
          onInput={(e) => setNameLen(e.currentTarget.value.length)}
          className="mt-1 input"
        />
        <span className="block text-xs text-subtle text-right mt-0.5">
          {nameLen}/{NAME_MAX}
        </span>
      </label>

      <label className="block">
        <span className="text-sm">Description</span>
        <textarea
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          defaultValue={v.description}
          onInput={(e) => setDescLen(e.currentTarget.value.length)}
          className="mt-1 textarea"
        />
        <span className="block text-xs text-subtle text-right mt-0.5">
          {descLen}/{DESCRIPTION_MAX}
        </span>
      </label>

      <label className="block">
        <span className="text-sm">Location (optional)</span>
        <input
          name="location"
          maxLength={LOCATION_MAX}
          defaultValue={v.location}
          placeholder="e.g. Jonker Street, Melaka"
          className="mt-1 input"
        />
        <span className="block text-xs text-muted mt-1">
          Shown to players on the join screen.
        </span>
      </label>

      <label className="block max-w-xs">
        <span className="text-sm">Player theme</span>
        <select name="theme" defaultValue={v.theme} className="mt-1 select">
          <option value="default">Default (Editorial)</option>
          <option value="matrix">Matrix (green CLI / hacker)</option>
        </select>
        <span className="block text-xs text-muted mt-1">
          Players see this theme when they join — green-on-black terminal vibe
          with digital rain for Matrix.
        </span>
      </label>

      <label className="block max-w-xs">
        <span className="text-sm">Ends at (optional)</span>
        <input
          type="datetime-local"
          name="ends_at"
          defaultValue={v.ends_at}
          className="mt-1 input"
        />
        <span className="block text-xs text-muted mt-1">
          Informational for now — start scheduling and pause/end live in the
          Status section above.
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
