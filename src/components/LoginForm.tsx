"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthFormState } from "@/lib/auth-actions";

const initialState: AuthFormState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 card !rounded-2xl !p-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted mt-1">
          Log in to host or join a game.
        </p>
      </div>

      {state.error && <p className="banner banner-error">{state.error}</p>}

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
        <span className="text-sm">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 input"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="text-sm text-center">
        No account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Sign up
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
