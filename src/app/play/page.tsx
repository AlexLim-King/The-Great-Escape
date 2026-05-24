import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import JoinGameForm from "@/components/JoinGameForm";

export default async function PlayHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1 max-w-md w-full mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2 tracking-tight">
        Join a game
      </h1>
      <p className="text-sm text-muted mb-4">
        Enter the join code your game master gave you.
      </p>

      <JoinGameForm authed={!!user} />

      {!user && (
        <p className="text-xs text-center text-muted mt-4">
          Have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>{" "}
          instead.
        </p>
      )}
    </main>
  );
}
