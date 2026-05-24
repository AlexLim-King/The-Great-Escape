"use client";

import { useActionState } from "react";
import { joinGame, type JoinFormState } from "@/lib/auth-actions";

const initialState: JoinFormState = {};

export default function JoinGameForm({ authed }: { authed: boolean }) {
  const [state, formAction, pending] = useActionState(joinGame, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <p className="banner banner-error">{state.error}</p>}

      {!authed && (
        <label className="block">
          <span className="text-sm">Your name</span>
          <input
            name="display_name"
            autoFocus
            required
            maxLength={40}
            placeholder="e.g. Alex"
            defaultValue={state.values?.display_name ?? ""}
            className="mt-1 input"
          />
        </label>
      )}

      <label className="block">
        {!authed && <span className="text-sm">Join code</span>}
        <input
          name="join_code"
          autoFocus={authed}
          autoCapitalize="characters"
          required
          placeholder="ABC123"
          defaultValue={state.values?.join_code ?? ""}
          className={`${
            authed ? "" : "mt-1 "
          }input text-lg font-mono uppercase tracking-widest text-center py-3`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-lg w-full"
      >
        {pending
          ? "Joining…"
          : authed
            ? "Continue →"
            : "Join as guest →"}
      </button>
    </form>
  );
}
