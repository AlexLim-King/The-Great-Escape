import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInAsGuest } from "@/lib/auth-actions";

async function goToGame(formData: FormData) {
  "use server";
  const code = ((formData.get("join_code") as string) ?? "")
    .trim()
    .toUpperCase();
  if (!code) redirect("/play?error=Enter+a+code");
  redirect(`/play/${code}`);
}

/**
 * Combined guest sign-in + game entry. Reads display_name and join_code,
 * does the anonymous sign-in, then redirects to /play/[code]. Used only
 * for the unauthenticated path on /play.
 */
async function joinAsGuest(formData: FormData) {
  "use server";
  const display_name = ((formData.get("display_name") as string) ?? "").trim();
  const code = ((formData.get("join_code") as string) ?? "")
    .trim()
    .toUpperCase();

  if (!display_name) redirect("/play?error=Pick+a+display+name");
  if (!code) redirect("/play?error=Enter+a+code");

  // Reuse the existing action; it handles ?next= and revalidation.
  const fd = new FormData();
  fd.set("display_name", display_name);
  fd.set("next", `/play/${code}`);
  await signInAsGuest(fd);
}

export default async function PlayHomePage(props: PageProps<"/play">) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1 max-w-md w-full mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Join a game</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">
        Enter the join code your game master gave you.
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mb-3">
          {error}
        </p>
      )}

      {user ? (
        // Authenticated path — just the code field
        <form action={goToGame} className="space-y-3">
          <input
            name="join_code"
            autoFocus
            autoCapitalize="characters"
            placeholder="ABC123"
            required
            className="block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-3 text-lg font-mono uppercase tracking-widest"
          />
          <button
            type="submit"
            className="w-full rounded bg-foreground text-background px-4 py-3 font-medium"
          >
            Continue →
          </button>
        </form>
      ) : (
        // Guest path — display name + code, single submit
        <>
          <form action={joinAsGuest} className="space-y-3">
            <label className="block">
              <span className="text-sm">Your name</span>
              <input
                name="display_name"
                autoFocus
                placeholder="e.g. Alex"
                required
                maxLength={40}
                className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="text-sm">Join code</span>
              <input
                name="join_code"
                autoCapitalize="characters"
                placeholder="ABC123"
                required
                className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-3 text-lg font-mono uppercase tracking-widest"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded bg-foreground text-background px-4 py-3 font-medium"
            >
              Join as guest →
            </button>
          </form>

          <p className="text-xs text-center text-black/60 dark:text-white/60 mt-4">
            Have an account?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>{" "}
            instead.
          </p>
        </>
      )}
    </main>
  );
}
