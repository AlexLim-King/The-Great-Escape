import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <section className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">
          Escape Room Missions
        </h1>
        <p className="text-black/70 dark:text-white/70">
          Host or play scavenger-hunt-style mission games. Build a chain of
          missions, assign them to teams, and watch progress unfold.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          {user ? (
            <>
              {!user.is_anonymous && (
                <Link
                  href="/games"
                  className="rounded bg-foreground text-background px-5 py-3 font-medium"
                >
                  Host a game →
                </Link>
              )}
              <Link
                href="/play"
                className={`rounded ${user.is_anonymous ? "bg-foreground text-background" : "border border-black/15 dark:border-white/15"} px-5 py-3 font-medium`}
              >
                Join a game →
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded bg-foreground text-background px-5 py-3 font-medium"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded border border-black/15 dark:border-white/15 px-5 py-3 font-medium"
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
