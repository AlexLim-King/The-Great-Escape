import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative flex-1 flex items-center justify-center px-4 py-16 z-10">
      <section className="max-w-3xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 pill pill-accent text-xs uppercase tracking-wider font-semibold">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
          />
          Mission Platform
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Run unforgettable{" "}
          <span className="text-gradient">missions</span>
          <br />
          with your team.
        </h1>

        <p className="text-muted max-w-xl mx-auto text-lg leading-relaxed">
          Host or play scavenger-hunt-style mission games. Build branching
          unlock chains, assign missions per team, and watch progress unfold
          live.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          {user ? (
            <>
              {!user.is_anonymous && (
                <Link href="/games" className="btn btn-primary btn-lg">
                  Host a game →
                </Link>
              )}
              <Link
                href="/play"
                className={
                  user.is_anonymous
                    ? "btn btn-primary btn-lg"
                    : "btn btn-secondary btn-lg"
                }
              >
                Join a game →
              </Link>
            </>
          ) : (
            <>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Get started
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg">
                Log in
              </Link>
            </>
          )}
        </div>

        {/* Three quick value props — gives the page some real content */}
        <ul className="grid sm:grid-cols-3 gap-3 pt-10 text-left">
          <li className="card card-compact">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="text-xl">🧩</span>
              <div>
                <p className="font-semibold text-sm">Branching unlocks</p>
                <p className="text-xs text-muted mt-0.5">
                  Boolean conditions + optional time gates. Any DAG works.
                </p>
              </div>
            </div>
          </li>
          <li className="card card-compact">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="text-xl">⏱️</span>
              <div>
                <p className="font-semibold text-sm">Live deadlines</p>
                <p className="text-xs text-muted mt-0.5">
                  Per-team timers, absolute or relative. Auto-expires.
                </p>
              </div>
            </div>
          </li>
          <li className="card card-compact">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="text-xl">📢</span>
              <div>
                <p className="font-semibold text-sm">Realtime updates</p>
                <p className="text-xs text-muted mt-0.5">
                  Broadcasts, judgments, and leaderboard push instantly.
                </p>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </main>
  );
}
