import Link from "next/link";
import { signup } from "@/lib/auth-actions";

export default async function SignupPage(props: PageProps<"/signup">) {
  const { error } = await props.searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <form
        action={signup}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-black/10 dark:border-white/10 p-6 bg-background"
      >
        <h1 className="text-2xl font-semibold">Create account</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2">
            {error}
          </p>
        )}

        <label className="block">
          <span className="text-sm">Display name</span>
          <input
            name="display_name"
            type="text"
            required
            autoComplete="name"
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
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
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded bg-foreground text-background py-2 font-medium hover:opacity-90"
        >
          Sign up
        </button>

        <p className="text-sm text-center">
          Already registered?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>

        <p className="text-xs text-center text-black/60 dark:text-white/60">
          Just here to play?{" "}
          <Link href="/play" className="underline">
            Join as guest
          </Link>
        </p>
      </form>
    </main>
  );
}
