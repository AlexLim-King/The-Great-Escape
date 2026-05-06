import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Guests can't own games — bounce them to the player surface.
  if (user.is_anonymous) redirect("/play");

  const { data: games } = await supabase
    .from("games")
    .select("id, name, status, join_code, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My games</h1>
        <Link
          href="/games/new"
          className="rounded bg-foreground text-background px-4 py-2 text-sm"
        >
          + New game
        </Link>
      </div>

      {!games || games.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          You haven&apos;t hosted any games yet.{" "}
          <Link href="/games/new" className="underline">
            Create your first one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li
              key={g.id}
              className="rounded border border-black/10 dark:border-white/10 p-4 flex items-center justify-between"
            >
              <div>
                <Link href={`/games/${g.id}`} className="font-medium">
                  {g.name}
                </Link>
                <p className="text-sm text-black/60 dark:text-white/60">
                  Join code:{" "}
                  <span className="font-mono">{g.join_code}</span>{" "}
                  · {g.status}
                </p>
              </div>
              <Link
                href={`/games/${g.id}`}
                className="text-sm underline"
              >
                Manage →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
