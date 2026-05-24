import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth-actions";
import NotificationBell from "@/components/NotificationBell";

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
    <header className="relative border-b border-default bg-surface/80 backdrop-blur-md sticky top-0 z-40">
      {/* Signature accent stripe — visible everywhere */}
      <div className="accent-rule absolute top-0 left-0 right-0 !rounded-none !h-[2px]" />

      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight flex items-center gap-2"
        >
          <span
            aria-hidden
            className="inline-block w-6 h-6 rounded-md"
            style={{ background: "var(--gradient-brand)" }}
          />
          <span>Escape Room</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              {!user.is_anonymous && (
                <Link href="/games" className="text-muted hover:text-text">
                  My games
                </Link>
              )}
              <Link href="/play" className="text-muted hover:text-text">
                Join
              </Link>
              <NotificationBell userId={user.id} />
              <span className="text-subtle hidden sm:inline">
                {user.is_anonymous ? `${displayName} (guest)` : displayName}
              </span>
              <form action={logout}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-text">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
