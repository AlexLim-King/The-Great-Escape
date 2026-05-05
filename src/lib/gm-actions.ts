"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ── Games ────────────────────────────────────────────────────────────────────

export async function createGame(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  if (!name) redirect("/games/new?error=Name+required");

  // Generate a join code via the SQL helper
  const { data: codeRow } = await supabase.rpc("gen_join_code");
  const join_code = (codeRow as unknown as string) ?? null;
  if (!join_code) redirect("/games/new?error=Could+not+generate+join+code");

  const { data, error } = await supabase
    .from("games")
    .insert({
      owner_id: user.id,
      name,
      description: description || null,
      join_code,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/games/new?error=${encodeURIComponent(error?.message ?? "Failed")}`);
  }

  revalidatePath("/games");
  redirect(`/games/${data.id}`);
}

export async function deleteGame(formData: FormData) {
  const { supabase } = await requireUser();
  const id = formData.get("id") as string;
  await supabase.from("games").delete().eq("id", id);
  revalidatePath("/games");
  redirect("/games");
}

// ── Teams ────────────────────────────────────────────────────────────────────

export async function createTeam(formData: FormData) {
  const { supabase } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string) || "#3b82f6";

  if (!name) redirect(`/games/${game_id}?error=Team+name+required`);

  const { error } = await supabase
    .from("teams")
    .insert({ game_id, name, color });

  if (error) {
    redirect(`/games/${game_id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}

export async function deleteTeam(formData: FormData) {
  const { supabase } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  await supabase.from("teams").delete().eq("id", id);
  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}

// ── Missions ─────────────────────────────────────────────────────────────────

export async function createMission(formData: FormData) {
  const { supabase } = await requireUser();
  const game_id = formData.get("game_id") as string;

  const title = (formData.get("title") as string)?.trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const points = parseInt((formData.get("points") as string) || "10", 10);
  const submission_type = formData.get("submission_type") as "text" | "photo";
  const validation_mode = formData.get("validation_mode") as "auto" | "gm_judged";
  const expected_answer =
    ((formData.get("expected_answer") as string) ?? "").trim() || null;
  const prereq_raw = (formData.get("prerequisite_mission_id") as string) || "";
  const prerequisite_mission_id = prereq_raw && prereq_raw !== "none" ? prereq_raw : null;

  if (!title) redirect(`/games/${game_id}/missions/new?error=Title+required`);

  // Auto + text requires an expected answer
  if (validation_mode === "auto" && submission_type === "text" && !expected_answer) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(
        "Auto-validated text missions need an expected answer.",
      )}`,
    );
  }
  // Photo missions cannot be auto (need GM judging)
  if (submission_type === "photo" && validation_mode === "auto") {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(
        "Photo missions must be GM-judged.",
      )}`,
    );
  }

  const { error } = await supabase.from("missions").insert({
    game_id,
    title,
    description: description || null,
    points,
    submission_type,
    validation_mode,
    expected_answer,
    prerequisite_mission_id,
  });

  if (error) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}

export async function deleteMission(formData: FormData) {
  const { supabase } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  await supabase.from("missions").delete().eq("id", id);
  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}

// ── Judging ──────────────────────────────────────────────────────────────────

export async function judgeSubmission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  const decision = formData.get("decision") as "approved" | "rejected";
  const feedback = ((formData.get("feedback") as string) ?? "").trim() || null;

  await supabase
    .from("submissions")
    .update({
      status: decision,
      feedback,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}
