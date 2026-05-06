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

  // Guests (anonymous Supabase auth users) cannot host games. RLS would
  // also reject this, but the server-side check gives us a friendly
  // error path instead of a generic policy violation.
  if (user.is_anonymous) {
    redirect(
      "/games/new?error=" +
        encodeURIComponent(
          "Hosting requires a full account. Sign up or log in to create a game.",
        ),
    );
  }

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

export async function updateMission(formData: FormData) {
  const { supabase } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const mission_id = formData.get("mission_id") as string;

  if (!mission_id) {
    redirect(`/games/${game_id}?error=Missing+mission+id`);
  }

  // Same parsing as createMission ─────────────────────────────────────────
  const title = (formData.get("title") as string)?.trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const points = parseInt((formData.get("points") as string) || "10", 10);
  const submission_type = formData.get("submission_type") as
    | "text"
    | "photo"
    | "video";
  const validation_mode = formData.get("validation_mode") as
    | "auto"
    | "gm_judged";
  const expected_answer =
    ((formData.get("expected_answer") as string) ?? "").trim() || null;
  const prereq_raw = (formData.get("prerequisite_mission_id") as string) || "";
  const prerequisite_mission_id =
    prereq_raw && prereq_raw !== "none" ? prereq_raw : null;

  const assignment_mode =
    ((formData.get("assignment_mode") as "all" | "specific") || "all");
  const team_ids =
    assignment_mode === "specific"
      ? (formData.getAll("team_ids") as string[]).filter(Boolean)
      : [];

  // Reference image: keep / replace / remove
  const ref_mode =
    ((formData.get("reference_image_mode") as string) || "keep") as
      | "keep"
      | "replace"
      | "remove";
  const reference_image = formData.get("reference_image") as File | null;

  // Deadline parsing ──────────────────────────────────────────────────────
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
  const editPath = `/games/${game_id}/missions/${mission_id}/edit`;

  if (deadline_mode === "absolute") {
    const raw = (formData.get("deadline_at") as string) || "";
    if (!raw) {
      redirect(
        `${editPath}?error=${encodeURIComponent(
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
        `${editPath}?error=${encodeURIComponent(
          "Relative deadline needs a positive minute count.",
        )}`,
      );
    }
    deadline_duration_sec = minutes * 60;
  }

  if (!title) redirect(`${editPath}?error=Title+required`);

  if (
    validation_mode === "auto" &&
    submission_type === "text" &&
    !expected_answer
  ) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        "Auto-validated text missions need an expected answer.",
      )}`,
    );
  }
  if (
    (submission_type === "photo" || submission_type === "video") &&
    validation_mode === "auto"
  ) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        "Photo and video missions must be GM-judged.",
      )}`,
    );
  }
  if (assignment_mode === "specific" && team_ids.length === 0) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        "Pick at least one team or switch to 'All teams'.",
      )}`,
    );
  }

  // Look up the existing reference path so we can clean up storage when
  // the GM picks Replace or Remove.
  const { data: existing } = await supabase
    .from("missions")
    .select("reference_image_path, game_id, prerequisite_mission_id")
    .eq("id", mission_id)
    .single();

  if (!existing) redirect(`/games/${game_id}?error=Mission+not+found`);
  if (existing.game_id !== game_id) {
    redirect(`/games/${game_id}?error=Mission+belongs+to+another+game`);
  }
  // Don't allow self-prerequisite (cycle of one)
  if (prerequisite_mission_id === mission_id) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        "A mission can't be its own prerequisite.",
      )}`,
    );
  }

  // Decide the new reference_image_path value (and any storage cleanup)
  let new_reference_image_path: string | null | undefined;
  if (ref_mode === "keep") {
    new_reference_image_path = undefined; // leave column alone
  } else if (ref_mode === "remove") {
    new_reference_image_path = null;
    if (existing.reference_image_path) {
      await supabase.storage
        .from("submissions")
        .remove([existing.reference_image_path]);
    }
  } else if (ref_mode === "replace") {
    if (!reference_image || reference_image.size === 0) {
      redirect(
        `${editPath}?error=${encodeURIComponent(
          "Pick an image or choose Keep / Remove.",
        )}`,
      );
    }
    const ext = (reference_image.name.split(".").pop() || "jpg")
      .toLowerCase()
      .slice(0, 4);
    const path = `mission-media/${game_id}/${mission_id}/ref-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(path, reference_image, {
        contentType: reference_image.type || "image/jpeg",
      });
    if (upErr) {
      redirect(
        `${editPath}?error=${encodeURIComponent(
          "Image upload failed: " + upErr.message,
        )}`,
      );
    }
    new_reference_image_path = path;
    if (existing.reference_image_path) {
      // Best-effort cleanup of the old asset
      await supabase.storage
        .from("submissions")
        .remove([existing.reference_image_path]);
    }
  }

  // Build the update payload. Conditional spread (rather than mutating a
  // Record<string, unknown>) keeps Supabase's typed update happy.
  const baseUpdate = {
    title,
    description: description || null,
    points,
    submission_type,
    validation_mode,
    expected_answer,
    prerequisite_mission_id,
    assignment_mode,
    deadline_mode,
    deadline_at,
    deadline_duration_sec,
  };
  const update =
    new_reference_image_path !== undefined
      ? { ...baseUpdate, reference_image_path: new_reference_image_path }
      : baseUpdate;

  const { error: updErr } = await supabase
    .from("missions")
    .update(update)
    .eq("id", mission_id);

  if (updErr) {
    redirect(`${editPath}?error=${encodeURIComponent(updErr.message)}`);
  }

  // Replace assignments wholesale: delete existing, reinsert if specific.
  // The player query joins mission_team_assignments to filter visibility,
  // so this is the only piece needed for the change to take effect.
  await supabase
    .from("mission_team_assignments")
    .delete()
    .eq("mission_id", mission_id);

  if (assignment_mode === "specific" && team_ids.length > 0) {
    const rows = team_ids.map((tid) => ({
      mission_id,
      team_id: tid,
    }));
    const { error: aErr } = await supabase
      .from("mission_team_assignments")
      .insert(rows);
    if (aErr) {
      redirect(
        `/games/${game_id}?error=${encodeURIComponent(
          "Mission updated but assignments failed: " + aErr.message,
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
  const tab = ((formData.get("tab") as string) ?? "").trim();

  // Bonus only meaningful on approve; clamp to >= 0
  const bonusRaw = (formData.get("bonus_points") as string) ?? "0";
  const bonus = Math.max(0, parseInt(bonusRaw, 10) || 0);

  await supabase
    .from("submissions")
    .update({
      status: decision,
      feedback,
      bonus_points: decision === "approved" ? bonus : 0,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/games/${game_id}/review`);
  redirect(
    tab
      ? `/games/${game_id}/review?tab=${tab}`
      : `/games/${game_id}/review`,
  );
}

/**
 * Discard a rejected submission entirely. The team's mission_state is
 * already 'unlocked' from the rejection trigger so they can simply try
 * again. Constrained to rejected rows for safety — anything else is a
 * no-op.
 */
export async function discardSubmission(formData: FormData) {
  const { supabase } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  const tab = ((formData.get("tab") as string) ?? "rejected").trim();

  await supabase
    .from("submissions")
    .delete()
    .eq("id", id)
    .eq("status", "rejected");

  revalidatePath(`/games/${game_id}/review`);
  redirect(`/games/${game_id}/review?tab=${tab}`);
}

/**
 * Edit the bonus on an already-approved submission without changing its
 * status. The DB trigger mirrors the new value to team_mission_state, so
 * the leaderboard refreshes via realtime.
 */
export async function updateSubmissionBonus(formData: FormData) {
  const { supabase } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  const tab = ((formData.get("tab") as string) ?? "approved").trim();

  const bonus = Math.max(
    0,
    parseInt((formData.get("bonus_points") as string) || "0", 10) || 0,
  );

  await supabase
    .from("submissions")
    .update({ bonus_points: bonus })
    .eq("id", id)
    .eq("status", "approved");

  revalidatePath(`/games/${game_id}/review`);
  redirect(`/games/${game_id}/review?tab=${tab}`);
}
