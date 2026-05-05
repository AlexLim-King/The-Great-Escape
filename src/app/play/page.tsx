import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function goToGame(formData: FormData) {
  "use server";
  const code = ((formData.get("join_code") as string) ?? "")
    .trim()
    .toUpperCase();
  if (!code) redirect("/play?error=Enter+a+code");
  redirect(`/play/${code}`);
}

export default async function PlayHomePage(props: PageProps<"/play">) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex-1 max-w-md w-full mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Join a game</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">
        Enter the join code your game master gave you.
      </p>

      <form action={goToGame} className="space-y-3">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2">
            {error}
          </p>
        )}
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
    </main>
  );
}
