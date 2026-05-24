"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthFormState } from "@/lib/auth-actions";

const initialState: AuthFormState = {};

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 card !rounded-2xl !p-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Create <span className="text-gradient">account</span>
        </h1>
        <p className="text-sm text-muted mt-1">
          Host games and design missions.
        </p>
      </div>

      {state.error && <p className="banner banner-error">{state.error}</p>}

      <label className="block">
        <span className="text-sm">Display name</span>
        <input
          name="display_name"
          type="text"
          required
          autoComplete="name"
          defaultValue={state.values?.display_name ?? ""}
          className="mt-1 input"
        />
      </label>

      <label className="block">
        <span className="text-sm">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.values?.email ?? ""}
          className="mt-1 input"
        />
      </label>

      <label className="block">
        <span className="text-sm">Password (min 6)</span>
        <input
          name="password"
          type="password"
          minLength={6}
          required
          autoComplete="new-password"
          className="mt-1 input"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Creating…" : "Sign up"}
      </button>

      <p className="text-sm text-center">
        Already registered?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>

      <p className="text-xs text-center text-muted">
        Just here to play?{" "}
        <Link href="/play" className="text-accent hover:underline">
          Join as guest
        </Link>
      </p>
    </form>
  );
}
