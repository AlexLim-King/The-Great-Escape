"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const display_name = formData.get("display_name") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Anonymous sign-in for players who don't want to create an account.
 * Creates a real auth.users row (no email) so all the existing RLS
 * policies and FK relationships work transparently. The user can later
 * upgrade to a full account via linkIdentity (not wired yet).
 */
export async function signInAsGuest(formData: FormData) {
  const display_name = ((formData.get("display_name") as string) ?? "").trim();
  if (!display_name) {
    redirect("/play?error=Pick+a+display+name");
  }

  // Honour an optional ?next= path, but only same-origin paths
  const next_raw = ((formData.get("next") as string) ?? "/play").trim();
  const next = next_raw.startsWith("/") && !next_raw.startsWith("//")
    ? next_raw
    : "/play";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name } },
  });

  if (error) {
    redirect(`/play?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}
