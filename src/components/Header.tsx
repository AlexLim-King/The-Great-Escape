import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth-actions";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? user.email ?? null;
  }

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold">
          Escape Room
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              {!user.is_anonymous && (
                <Link href="/games" className="hover:underline">
                  My games
                </Link>
              )}
              <Link href="/play" className="hover:underline">
                Join
              </Link>
              <span className="text-black/60 dark:text-white/60">
                {user.is_anonymous ? `${displayName} (guest)` : displayName}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded border border-black/15 dark:border-white/15 px-3 py-1 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded bg-foreground text-background px-3 py-1"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
