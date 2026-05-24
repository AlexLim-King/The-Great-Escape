"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Shared form-state shape for useActionState-driven auth forms.
 *
 * Pattern (see CONVENTIONS in AGENTS.md): on a validation or server error
 * we *return* `{ error, values }` instead of redirecting, so the client
 * form re-renders in place with the message shown and the user's input
 * preserved. We never echo back secret fields (passwords). On success the
 * action redirects, which unmounts the form.
 */
export type AuthFormState = {
  error?: string;
  values?: { email?: string; display_name?: string };
};

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message, values: { email } };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  const display_name = ((formData.get("display_name") as string) ?? "").trim();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) {
    return { error: error.message, values: { email, display_name } };
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

export type JoinFormState = {
  error?: string;
  values?: { display_name?: string; join_code?: string };
};

/**
 * Unified game-entry action for the /play page. Handles both the
 * authenticated path (just a join code) and the guest path (display name
 * + code, with an anonymous sign-in). Anonymous users are real
 * auth.users rows so all existing RLS policies and FKs work unchanged.
 *
 * Returns `{ error, values }` on failure so the form keeps what the
 * player typed; redirects to /play/[code] on success.
 */
export async function joinGame(
  _prev: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const join_code = ((formData.get("join_code") as string) ?? "")
    .trim()
    .toUpperCase();
  const display_name = ((formData.get("display_name") as string) ?? "").trim();

  // Authenticated players just need a code.
  if (user) {
    if (!join_code) return { error: "Enter a join code.", values: { join_code } };
    redirect(`/play/${join_code}`);
  }

  // Guest path: name + code, then an anonymous sign-in.
  if (!display_name) {
    return {
      error: "Pick a display name.",
      values: { display_name, join_code },
    };
  }
  if (!join_code) {
    return {
      error: "Enter a join code.",
      values: { display_name, join_code },
    };
  }

  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name } },
  });
  if (error) {
    return { error: error.message, values: { display_name, join_code } };
  }

  revalidatePath("/", "layout");
  redirect(`/play/${join_code}`);
}
