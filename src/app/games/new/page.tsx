import { createGame } from "@/lib/gm-actions";

export default async function NewGamePage(props: PageProps<"/games/new">) {
  const { error } = await props.searchParams;

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
