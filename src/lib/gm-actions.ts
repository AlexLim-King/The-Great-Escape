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

/**
 * Form state shape for useActionState-driven forms. On a validation or
 * server error we return `{ error, values }` (instead of redirecting) so
 * the client form can show the message and re-seed its inputs — the GM
 * never loses what they typed. On success the action redirects, which
 * unmounts the form.
 */
export type GameFormState = {
  error?: string;
  values?: { name: string; description: string };
};

export async function createGame(
  _prev: GameFormState,
  formData: FormData,
): Promise<GameFormState> {
  const { supabase, user } = await requireUser();

  const name = (formData.get("name") as string)?.trim() ?? "";
  const description = ((formData.get("description") as string) ?? "").trim();
  const values = { name, description };

  // Guests (anonymous Supabase auth users) cannot host games. RLS would
  // also reject this, but the server-side check gives us a friendly
  // error path instead of a generic policy violation.
  if (user.is_anonymous) {
    return {
      error:
        "Hosting requires a full account. Sign up or log in to create a game.",
      values,
    };
  }

  if (!name) return { error: "Name is required.", values };

  // Generate a join code via the SQL helper
  const { data: codeRow } = await supabase.rpc("gen_join_code");
  const join_code = (codeRow as unknown as string) ?? null;
  if (!join_code) return { error: "Could not generate a join code.", values };

  const { data, error } = await supabase
    .from("games")
    .insert({
      owner_id: user.id,
      name,
      description: description || null,
      join_code,
      // New games start unstarted so the GM can start now or schedule a
      // start (see setGameStatus / scheduleGameStart). Players can join
      // teams while draft, but can't submit until it goes active.
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create game.", values };
  }

  // Seed every new game with four ready-to-use teams so the GM can hand
  // out join codes immediately. The GM can rename, recolor, or remove
  // these on the Setup page.
  const defaultTeams = [
    { name: "Team 1", color: "#ef4444" },
    { name: "Team 2", color: "#3b82f6" },
    { name: "Team 3", color: "#22c55e" },
    { name: "Team 4", color: "#f59e0b" },
  ];
  await supabase
    .from("teams")
    .insert(defaultTeams.map((t) => ({ ...t, game_id: data.id })));

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

const GAME_STATUSES = ["draft", "active", "paused", "ended"] as const;
type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * Change a game's lifecycle status (draft → active → paused ⇄ active →
 * ended, with reopen). Simple button action — nothing to preserve, so it
 * redirects. Revalidates the layout so the player surface picks up the
 * new status immediately.
 */
export async function setGameStatus(formData: FormData) {
  const { supabase, user } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const status = formData.get("status") as string;

  if (!GAME_STATUSES.includes(status as GameStatus)) {
    redirect(`/games/${game_id}/settings?error=Invalid+status`);
  }

  await supabase
    .from("games")
    .update({ status })
    .eq("id", game_id)
    .eq("owner_id", user.id);

  revalidatePath(`/games/${game_id}`, "layout");
  redirect(`/games/${game_id}/settings`);
}

/**
 * Schedule a start and keep the game in 'draft' — it auto-activates on the
 * next read once the time arrives (via refresh_game_status). Accepts either:
 *   - a relative duration (`amount` + `unit` of minutes/hours/days), or
 *   - an absolute wall-clock time (`starts_at`, a datetime-local string)
 *     for when the GM needs a specific trigger time.
 * If both are present, the absolute time wins.
 */
export async function scheduleGameStart(formData: FormData) {
  const { supabase, user } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const at_raw = ((formData.get("starts_at") as string) ?? "").trim();
  const amount = parseInt((formData.get("amount") as string) || "0", 10);
  const unit = (formData.get("unit") as string) || "minutes";
  const settingsPath = `/games/${game_id}/settings`;
  const fail = (msg: string) =>
    redirect(`${settingsPath}?error=${encodeURIComponent(msg)}`);

  let starts_at: string;
  if (at_raw) {
    const d = new Date(at_raw);
    if (Number.isNaN(d.getTime())) fail("That start time isn't valid.");
    if (d.getTime() <= Date.now()) fail("Pick a start time in the future.");
    starts_at = d.toISOString();
  } else {
    if (!amount || amount <= 0) fail("Enter how long until the start.");
    const secPerUnit = unit === "hours" ? 3600 : unit === "days" ? 86400 : 60;
    starts_at = new Date(Date.now() + amount * secPerUnit * 1000).toISOString();
  }

  await supabase
    .from("games")
    .update({ starts_at, status: "draft" })
    .eq("id", game_id)
    .eq("owner_id", user.id);

  revalidatePath(`/games/${game_id}`, "layout");
  redirect(settingsPath);
}

/** Cancel a scheduled start (clear starts_at; game stays draft). */
export async function cancelGameStart(formData: FormData) {
  const { supabase, user } = await requireUser();
  const game_id = formData.get("game_id") as string;

  await supabase
    .from("games")
    .update({ starts_at: null })
    .eq("id", game_id)
    .eq("owner_id", user.id);

  revalidatePath(`/games/${game_id}`, "layout");
  redirect(`/games/${game_id}/settings`);
}

export type GameSettingsState = {
  error?: string;
  values?: {
    name: string;
    description: string;
    location: string;
    ends_at: string;
    theme: string;
  };
};

const GAME_THEMES = ["default", "matrix"] as const;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
const LOCATION_MAX = 120;

/**
 * Edit game name / description / end time / player theme. useActionState
 * pattern so a validation error keeps the GM's input (see AGENTS.md). Start
 * scheduling lives in its own controls (setGameStatus / scheduleGameStart).
 * The end time is informational for now (no auto-end).
 */
export async function updateGameSettings(
  _prev: GameSettingsState,
  formData: FormData,
): Promise<GameSettingsState> {
  const { supabase, user } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const location = ((formData.get("location") as string) ?? "").trim();
  const ends_raw = ((formData.get("ends_at") as string) ?? "").trim();
  const themeRaw = ((formData.get("theme") as string) ?? "default").trim();
  const theme = GAME_THEMES.includes(themeRaw as (typeof GAME_THEMES)[number])
    ? themeRaw
    : "default";
  const values = { name, description, location, ends_at: ends_raw, theme };

  if (!name) return { error: "Name is required.", values };
  if (name.length > NAME_MAX)
    return { error: `Name must be ${NAME_MAX} characters or fewer.`, values };
  if (description.length > DESCRIPTION_MAX)
    return {
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      values,
    };
  if (location.length > LOCATION_MAX)
    return {
      error: `Location must be ${LOCATION_MAX} characters or fewer.`,
      values,
    };

  const ends_at = ends_raw ? new Date(ends_raw).toISOString() : null;

  const { error } = await supabase
    .from("games")
    .update({
      name,
      description: description || null,
      location: location || null,
      ends_at,
      theme,
    })
    .eq("id", game_id)
    .eq("owner_id", user.id);
  if (error) return { error: error.message, values };

  revalidatePath(`/games/${game_id}`, "layout");
  redirect(`/games/${game_id}/settings`);
}

/**
 * Upload, replace, or remove the game's cover image (shown to players on
 * the join/intro screen). Plain server action (handles a file), separate
 * from the useActionState settings form. Stored in the `submissions`
 * bucket under game-media/...; old files are cleaned up on replace/remove.
 */
export async function setGameImage(formData: FormData) {
  const { supabase, user } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const remove = formData.get("remove") === "1";
  const file = formData.get("image") as File | null;
  const settingsPath = `/games/${game_id}/settings`;
  const fail = (msg: string) =>
    redirect(`${settingsPath}?error=${encodeURIComponent(msg)}`);

  const { data: game } = await supabase
    .from("games")
    .select("owner_id, image_path")
    .eq("id", game_id)
    .single();
  if (!game || game.owner_id !== user.id) fail("Game not found or not yours.");
  const existingPath = game!.image_path;

  if (remove) {
    if (existingPath) {
      await supabase.storage.from("submissions").remove([existingPath]);
    }
    await supabase.from("games").update({ image_path: null }).eq("id", game_id);
    revalidatePath(settingsPath, "layout");
    redirect(settingsPath);
  }

  if (!file || file.size === 0) fail("Pick an image to upload.");
  if (file!.size > 10 * 1024 * 1024) fail("Image must be 10 MB or smaller.");

  const ext =
    (file!.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "jpg";
  const path = `game-media/${game_id}/cover-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("submissions")
    .upload(path, file!, { contentType: file!.type || "image/jpeg" });
  if (upErr) fail("Upload failed: " + upErr.message);

  if (existingPath) {
    await supabase.storage.from("submissions").remove([existingPath]);
  }
  await supabase.from("games").update({ image_path: path }).eq("id", game_id);
  revalidatePath(settingsPath, "layout");
  redirect(settingsPath);
}

// ── Teams ────────────────────────────────────────────────────────────────────

export type TeamFormState = {
  error?: string;
  values?: { name: string; color: string };
};

export async function createTeam(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const { supabase } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const name = (formData.get("name") as string)?.trim() ?? "";
  const color = (formData.get("color") as string) || "#3b82f6";
  const password = ((formData.get("password") as string) ?? "").trim();
  const values = { name, color };

  if (!name) return { error: "Team name is required.", values };

  const { data: inserted, error } = await supabase
    .from("teams")
    .insert({ game_id, name, color })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the team.", values };
  }

  if (password) {
    const { error: pwErr } = await supabase.rpc("set_team_password", {
      p_team_id: inserted.id,
      p_password: password,
    });
    if (pwErr) {
      // Team exists now; surface the password problem but don't keep the
      // (already-used) name in the form.
      return { error: "Team created, but setting the password failed: " + pwErr.message };
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

/**
 * Parse the optional reference-links list out of a mission form's
 * FormData. Drops rows with empty url, accepts http/https only,
 * deduplicates by URL, caps at 10 to avoid abuse.
 */
function parseReferenceLinksFromFormData(
  formData: FormData,
): { reference_links: { label: string; url: string }[]; error?: string } {
  const raw = ((formData.get("reference_links") as string) ?? "[]").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reference_links: [], error: "Invalid reference links." };
  }
  if (!Array.isArray(parsed)) {
    return { reference_links: [], error: "Reference links must be a list." };
  }

  const cleaned: { label: string; url: string }[] = [];
  const seenUrls = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!url) continue;
    // Only accept http/https — block javascript:, data:, etc.
    if (!/^https?:\/\//i.test(url)) {
      return {
        reference_links: [],
        error: "Links must start with http:// or https://",
      };
    }
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    cleaned.push({ label: label || url, url });
    if (cleaned.length >= 10) break;
  }

  return { reference_links: cleaned };
}

/**
 * Parse the boolean unlock spec out of a mission form's FormData.
 *
 * Wire format:
 *   unlock_groups   stringified JSON: array of arrays of mission UUIDs
 *   unlock_after    datetime-local string (optional time gate)
 *
 * Returns the cleaned arrays plus an optional error string. Empty inner
 * groups, duplicates within a group, and duplicate groups are silently
 * dropped. Self-reference (a mission listed in its own unlock spec) is
 * a hard error.
 */
function parseUnlockFromFormData(
  formData: FormData,
  excludeMissionId?: string,
): {
  unlock_groups: string[][];
  unlock_after: string | null;
  error?: string;
} {
  const after_raw = ((formData.get("unlock_after") as string) ?? "").trim();
  const unlock_after = after_raw ? new Date(after_raw).toISOString() : null;

  const groups_raw = (
    (formData.get("unlock_groups") as string) ?? "[]"
  ).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(groups_raw);
  } catch {
    return {
      unlock_groups: [],
      unlock_after,
      error: "Invalid unlock conditions.",
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      unlock_groups: [],
      unlock_after,
      error: "Unlock conditions must be a list.",
    };
  }

  const cleaned: string[][] = [];
  const seen = new Set<string>();
  for (const g of parsed) {
    if (!Array.isArray(g)) continue;
    const ids = Array.from(
      new Set(
        g.filter((x): x is string => typeof x === "string" && x.length > 0),
      ),
    );
    if (ids.length === 0) continue; // skip empty AND-groups
    if (excludeMissionId && ids.includes(excludeMissionId)) {
      return {
        unlock_groups: [],
        unlock_after,
        error: "A mission can't appear in its own unlock conditions.",
      };
    }
    const key = JSON.stringify([...ids].sort());
    if (seen.has(key)) continue; // dedupe identical groups
    seen.add(key);
    cleaned.push(ids);
  }

  return { unlock_groups: cleaned, unlock_after };
}

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

  // Boolean unlock expression + optional time gate
  const unlockParsed = parseUnlockFromFormData(formData);
  if (unlockParsed.error) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(unlockParsed.error)}`,
    );
  }
  const { unlock_groups, unlock_after } = unlockParsed;

  // Reference links
  const linksParsed = parseReferenceLinksFromFormData(formData);
  if (linksParsed.error) {
    redirect(
      `/games/${game_id}/missions/new?error=${encodeURIComponent(linksParsed.error)}`,
    );
  }
  const { reference_links } = linksParsed;

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

  // New missions get appended to the end of the existing display order.
  // Using (max + 1) keeps positions distinct so reordering has stable
  // edges to drop into.
  const { data: lastOrderRow } = await supabase
    .from("missions")
    .select("display_order")
    .eq("game_id", game_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (lastOrderRow?.display_order ?? -1) + 1;

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
      unlock_groups,
      unlock_after,
      reference_links,
      deadline_mode,
      deadline_at,
      deadline_duration_sec,
      assignment_mode,
      display_order,
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

/**
 * Batch-create template missions from a folder of images. The browser
 * uploads each image straight to storage (avoiding the server-action body
 * limit) and passes us the resulting paths + a title derived from each
 * file name. We insert the mission rows here.
 *
 * Defaults: GM-judged (there's no answer key to auto-check against),
 * always-available unlock, assigned to all teams. The GM tweaks anything
 * else afterwards via the normal edit page.
 *
 * Takes plain args (not FormData) so it can be called directly from the
 * batch-upload client component, same pattern as reorderMissions.
 */
export async function createMissionsBatch(
  gameId: string,
  items: Array<{
    title: string;
    reference_image_path: string;
    points: number;
    submission_type: "text" | "photo" | "video";
  }>,
): Promise<{ created: number; error?: string }> {
  const { supabase, user } = await requireUser();

  if (!items || items.length === 0) {
    return { created: 0, error: "No missions to create." };
  }
  if (items.length > 100) {
    return { created: 0, error: "Too many at once — max 100 per batch." };
  }

  // Friendly ownership check (RLS also enforces missions_insert_gm).
  const { data: game } = await supabase
    .from("games")
    .select("id, owner_id")
    .eq("id", gameId)
    .single();
  if (!game || game.owner_id !== user.id) {
    return { created: 0, error: "Game not found or not yours." };
  }

  // Append after any existing missions so display order stays stable.
  const { data: lastOrderRow } = await supabase
    .from("missions")
    .select("display_order")
    .eq("game_id", gameId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = (lastOrderRow?.display_order ?? -1) + 1;

  const allowedTypes = new Set(["text", "photo", "video"]);
  const rows = items.map((it) => ({
    game_id: gameId,
    title: it.title.trim() || "Untitled mission",
    description: null,
    points: Math.max(0, Math.floor(it.points) || 0),
    submission_type: allowedTypes.has(it.submission_type)
      ? it.submission_type
      : "photo",
    // No answer key in a batch, so everything is GM-judged.
    validation_mode: "gm_judged" as const,
    expected_answer: null,
    unlock_groups: [],
    unlock_after: null,
    reference_links: [],
    reference_image_path: it.reference_image_path,
    deadline_mode: null,
    deadline_at: null,
    deadline_duration_sec: null,
    assignment_mode: "all" as const,
    display_order: order++,
  }));

  const { error } = await supabase.from("missions").insert(rows);
  if (error) return { created: 0, error: error.message };

  revalidatePath(`/games/${gameId}`);
  return { created: rows.length };
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

  // Boolean unlock expression + optional time gate, with self-reference guard
  const unlockParsed = parseUnlockFromFormData(formData, mission_id);
  if (unlockParsed.error) {
    redirect(
      `/games/${game_id}/missions/${mission_id}/edit?error=${encodeURIComponent(unlockParsed.error)}`,
    );
  }
  const { unlock_groups, unlock_after } = unlockParsed;

  // Reference links
  const linksParsed = parseReferenceLinksFromFormData(formData);
  if (linksParsed.error) {
    redirect(
      `/games/${game_id}/missions/${mission_id}/edit?error=${encodeURIComponent(linksParsed.error)}`,
    );
  }
  const { reference_links } = linksParsed;

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
    .select("reference_image_path, game_id")
    .eq("id", mission_id)
    .single();

  if (!existing) redirect(`/games/${game_id}?error=Mission+not+found`);
  if (existing.game_id !== game_id) {
    redirect(`/games/${game_id}?error=Mission+belongs+to+another+game`);
  }
  // Self-reference in unlock_groups was already rejected by
  // parseUnlockFromFormData (excludeMissionId=mission_id) above.

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
    unlock_groups,
    unlock_after,
    reference_links,
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

/**
 * Reorder all missions in a game in a single atomic call.
 *
 * `orderedMissionIds` is the new full ordering (top-to-bottom). The RPC
 * does authorization (must be GM) and a single UPDATE with a values-from-
 * unnest join, so partial reorders never leak.
 *
 * Designed to be called directly from a client component without going
 * through a <form>, so this takes plain arguments instead of FormData.
 */
export async function reorderMissions(
  gameId: string,
  orderedMissionIds: string[],
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reorder_missions", {
    p_game_id: gameId,
    p_ids: orderedMissionIds,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/games/${gameId}`);
}

// ── Judging ──────────────────────────────────────────────────────────────────

/**
 * Decide where a judging action returns to. The review surfaces pass a
 * `redirect_to` path (the per-mission page, or a status-view URL); we
 * accept it only if it's a same-origin path. Falls back to the legacy
 * `tab` field, then to the bare review page.
 */
function judgeReturnPath(formData: FormData, gameId: string): string {
  const redirectTo = ((formData.get("redirect_to") as string) ?? "").trim();
  if (redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }
  const tab = ((formData.get("tab") as string) ?? "").trim();
  return tab
    ? `/games/${gameId}/review?view=status&tab=${tab}`
    : `/games/${gameId}/review`;
}

export async function judgeSubmission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = formData.get("id") as string;
  const game_id = formData.get("game_id") as string;
  const decision = formData.get("decision") as "approved" | "rejected";
  const feedback = ((formData.get("feedback") as string) ?? "").trim() || null;

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

  const dest = judgeReturnPath(formData, game_id);
  revalidatePath(`/games/${game_id}/review`, "layout");
  redirect(dest);
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

  await supabase
    .from("submissions")
    .delete()
    .eq("id", id)
    .eq("status", "rejected");

  const dest = judgeReturnPath(formData, game_id);
  revalidatePath(`/games/${game_id}/review`, "layout");
  redirect(dest);
}

// ── Announcements ────────────────────────────────────────────────────────────

/**
 * Broadcast an announcement to every player in the game. Fans out into
 * one notification row per team member via the broadcast_announcement
 * RPC, which authorizes against games.owner_id. The redirect carries a
 * recipient count in the query string so the Review page can show a
 * lightweight confirmation.
 */
export async function broadcastAnnouncement(formData: FormData) {
  const { supabase } = await requireUser();
  const game_id = formData.get("game_id") as string;
  const title = ((formData.get("title") as string) ?? "").trim();
  const body = ((formData.get("body") as string) ?? "").trim() || undefined;
  const tab = ((formData.get("tab") as string) ?? "").trim();

  const reviewPath = `/games/${game_id}/review`;
  const back = (params: string) =>
    tab ? `${reviewPath}?tab=${tab}&${params}` : `${reviewPath}?${params}`;

  if (!title) {
    redirect(back("announce_error=" + encodeURIComponent("Title is required.")));
  }
  if (title.length > 120) {
    redirect(
      back("announce_error=" + encodeURIComponent("Title is too long (max 120 chars).")),
    );
  }
  if (body && body.length > 2000) {
    redirect(
      back("announce_error=" + encodeURIComponent("Message is too long (max 2000 chars).")),
    );
  }

  const { data, error } = await supabase.rpc("broadcast_announcement", {
    p_game_id: game_id,
    p_title: title,
    p_body: body,
  });

  if (error) {
    redirect(back("announce_error=" + encodeURIComponent(error.message)));
  }

  const sent = (data as unknown as number) ?? 0;
  revalidatePath(reviewPath);
  redirect(back("announce_sent=" + String(sent)));
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

  const bonus = Math.max(
    0,
    parseInt((formData.get("bonus_points") as string) || "0", 10) || 0,
  );

  await supabase
    .from("submissions")
    .update({ bonus_points: bonus })
    .eq("id", id)
    .eq("status", "approved");

  const dest = judgeReturnPath(formData, game_id);
  revalidatePath(`/games/${game_id}/review`, "layout");
  redirect(dest);
}
