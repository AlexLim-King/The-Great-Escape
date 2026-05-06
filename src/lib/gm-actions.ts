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
  const password = ((formData.get("password") as string) ?? "").trim();

  if (!name) redirect(`/games/${game_id}?error=Team+name+required`);

  const { data: inserted, error } = await supabase
    .from("teams")
    .insert({ game_id, name, color })
    .select("id")
    .single();

  if (error || !inserted) {
    redirect(
      `/games/${game_id}?error=${encodeURIComponent(error?.message ?? "Insert failed")}`,
    );
  }

  if (password) {
    const { error: pwErr } = await supabase.rpc("set_team_password", {
      p_team_id: inserted.id,
      p_password: password,
    });
    if (pwErr) {
      redirect(
        `/games/${game_id}?error=${encodeURIComponent("Team created but password failed: " + pwErr.message)}`,
      );
    }
  }

  revalidatePath(`/games/${game_id}`);
  redirect(`/games/${game_id}`);
}

export async function setTeamPassword(formData: FormData) {
  const { supabase } = await requireUser();
  const team_id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  const raw = (formData.get("password") as string) ?? "";

  // Empty string clears the password
  const { error } = await supabase.rpc("set_team_password", {
    p_team_id: team_id,
    p_password: raw.trim() || "",
  });

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
  const submission_type = formData.get("submission_type") as
    | "text"
    | "photo"
    | "video";
  const validation_mode = formData.get("validation_mode") as "auto" | "gm_judged";
  const expected_answer =
    ((formData.get("expected_answer") as string) ?? "").trim() || null;
  const prereq_raw = (formData.get("prerequisite_mission_id") as string) || "";
  const prerequisite_mission_id = prereq_raw && prereq_raw !== "none" ? prereq_raw : null;

  // Assignment
  const assignment_mode = (formData.get("assignment_mode") as
    | "all"
    | "specific") || "all";
  const team_ids =
    assignment_mode === "specific"
      ? (formData.getAll("team_ids") as string[]).filter(Boolean)
      : [];

  // Reference image
  const reference_image = formData.get("reference_image") as File | null;

  // Deadline fields
  const deadline_mode_raw = (formData.get("deadline_mode") as string) || "none";
  const deadline_mode =
    deadline_mode_raw === "none"
      ? null
      : (deadline_mode_raw as
          | "absolute"
          | "relative_to_unlock"
          | "relative_to_game_start");

  let deadline_at: string | null = null;
  let deadline_duration_sec: number | null = null;

  if (deadline_mode === "absolute") {
    const raw = (formData.get("deadline_at") as string) || "";
    if (!raw) {
      redirect(
        `/games/${game_id}/missions/new?error=${encodeURIComponent(
          "Absolute deadline needs a date/time.",
        )}`,
      );
    }
    deadline_at = new Date(raw).toISOString();
  } else if (
    deadline_mode === "relative_to_unlock" ||
    deadline_mode === "relative_to_game_start"
  ) {
    const minutes = parseInt(
      (formData.get("deadline_duration_min") as string) || "0",
      10,
    );
    if (!minutes || minutes <= 0) {
      redirect(
        `/games/${game_id}/missions/new?error=${encodeURIComponent(
          "Relative deadline needs a positive minute count.",
        )}`,
      );
    }
    deadline_duration_sec = minutes * 60;
  }

  if (!title) redirect(`/games/${game_id}/missions/new?error=Title+required`);

  // Auto + text requires an expected answer
  if (validation_mode === "auto" && submission_type === "text" && !expected_answer) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(
        "Auto-validated text missions need an expected answer.",
      )}`,
    );
  }
  // Photo / video missions must be GM-judged (no auto path)
  if (
    (submission_type === "photo" || submission_type === "video") &&
    validation_mode === "auto"
  ) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(
        "Photo and video missions must be GM-judged.",
      )}`,
    );
  }
  // Specific assignment must include at least one team
  if (assignment_mode === "specific" && team_ids.length === 0) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(
        "Pick at least one team or switch to 'All teams'.",
      )}`,
    );
  }

  const { data: inserted, error } = await supabase
    .from("missions")
    .insert({
      game_id,
      title,
      description: description || null,
      points,
      submission_type,
      validation_mode,
      expected_answer,
      prerequisite_mission_id,
      deadline_mode,
      deadline_at,
      deadline_duration_sec,
      assignment_mode,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(error?.message ?? "Insert failed")}`,
    );
  }

  // Reference image upload (best-effort — failure rolls the mission back)
  if (reference_image && reference_image.size > 0) {
    const ext = (reference_image.name.split(".").pop() || "jpg")
      .toLowerCase()
      .slice(0, 4);
    const path = `mission-media/${game_id}/${inserted.id}/ref-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(path, reference_image, {
        contentType: reference_image.type || "image/jpeg",
      });
    if (upErr) {
      // Roll back the mission so the GM can retry cleanly
      await supabase.from("missions").delete().eq("id", inserted.id);
      redirect(
        `/games/${game_id}/missions/new?error=${encodeURIComponent("Image upload failed: " + upErr.message)}`,
      );
    }
    await supabase
      .from("missions")
      .update({ reference_image_path: path })
      .eq("id", inserted.id);
  }

  // Specific-team assignments
  if (assignment_mode === "specific" && team_ids.length > 0) {
    const rows = team_ids.map((tid) => ({
      mission_id: inserted.id,
      team_id: tid,
    }));
    const { error: aErr } = await supabase
      .from("mission_team_assignments")
      .insert(rows);
    if (aErr) {
      // Mission was already created — surface the error but don't roll back
      redirect(
        `/games/${game_id}?error=${encodeURIComponent(
          "Mission created but assignments failed: " + aErr.message,
        )}`,
      );
    }
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
