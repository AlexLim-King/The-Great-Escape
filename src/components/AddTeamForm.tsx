"use client";

import { useActionState } from "react";
import { createTeam, type TeamFormState } from "@/lib/gm-actions";

const initialState: TeamFormState = {};

export default function AddTeamForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(
    createTeam,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-2">
      {state.error && <p className="banner banner-error">{state.error}</p>}

      <div className="flex gap-2 flex-wrap">
        <input type="hidden" name="game_id" value={gameId} />
        <input
          name="name"
          placeholder="Team name"
          required
          defaultValue={state.values?.name ?? ""}
          className="input flex-1 min-w-[10rem]"
        />
        <input
          name="password"
          type="text"
          placeholder="Password (optional)"
          className="input w-44"
        />
        <input
          name="color"
          type="color"
          defaultValue={state.values?.color ?? "#3b82f6"}
          className="h-10 w-12 rounded-md border border-strong cursor-pointer"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Adding…" : "Add team"}
        </button>
      </div>
    </form>
  );
}
