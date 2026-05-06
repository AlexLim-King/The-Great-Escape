import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGame } from "@/lib/gm-actions";

export default async function NewGamePage(props: PageProps<"/games/new">) {
  const { error } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Guests can't host. Show a friendly upsell instead of the form so the
  // server-action error message never surprises them.
  if (user.is_anonymous) {
    return (
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-10 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Hosting needs an account</h1>
        <p className="text-black/70 dark:text-white/70">
          You&apos;re currently playing as a guest. To host your own game,
          create an account or log in.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/signup"
            className="rounded bg-foreground text-background px-4 py-2 font-medium"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="rounded border border-black/15 dark:border-white/15 px-4 py-2 font-medium"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">New game</h1>

      <form action={createGame} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2">
            {error}
          </p>
        )}

        <label className="block">
          <span className="text-sm">Name</span>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm">Description (optional)</span>
          <textarea
            name="description"
            rows={3}
            className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded bg-foreground text-background px-4 py-2 font-medium"
        >
          Create game
        </button>
      </form>
    </main>
  );
}
