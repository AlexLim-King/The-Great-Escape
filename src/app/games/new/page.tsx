import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewGameForm from "@/components/NewGameForm";

export default async function NewGamePage() {
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
        <p className="text-muted">
          You&apos;re currently playing as a guest. To host your own game,
          create an account or log in.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4 tracking-tight">New game</h1>

      <NewGameForm />
    </main>
  );
}
