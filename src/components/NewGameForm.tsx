"use client";

import { useActionState } from "react";
import { createGame, type GameFormState } from "@/lib/gm-actions";

const initialState: GameFormState = {};

export default function NewGameForm() {
  const [state, formAction, pending] = useActionState(
    createGame,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <p className="banner banner-error">{state.error}</p>}

      <label className="block">
        <span className="text-sm">Name</span>
        <input
          name="name"
          required
          defaultValue={state.values?.name ?? ""}
          className="mt-1 input"
        />
      </label>

      <label className="block">
        <span className="text-sm">Description (optional)</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={state.values?.description ?? ""}
          className="mt-1 textarea"
        />
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Creating…" : "Create game"}
      </button>
    </form>
  );
}
