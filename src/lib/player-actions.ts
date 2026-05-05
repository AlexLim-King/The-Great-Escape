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

export async function joinTeam(formData: FormData) {
  const { supabase, user } = await requireUser();
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;

  // Verify the team belongs to this game (defensive — RLS should also gate it)
  const { data: team } = await supabase
    .from("teams")
    .select("id, game_id, games!inner(join_code)")
    .eq("id", team_id)
    .single();

  if (!team) redirect(`/play/${join_code}?error=Team+not+found`);

  const { error } = await supabase
    .from("team_members")
    .insert({ team_id, user_id: user.id });

  if (error && !error.message.includes("duplicate")) {
    redirect(`/play/${join_code}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/play/${join_code}`);
  redirect(`/play/${join_code}`);
}

export async function leaveTeam(formData: FormData) {
  const { supabase, user } = await requireUser();
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;

  await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team_id)
    .eq("user_id", user.id);

  revalidatePath(`/play/${join_code}`);
  redirect(`/play/${join_code}`);
}

async function ensureMissionSubmittable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  team_id: string,
  mission_id: string,
  join_code: string,
) {
  // Sweep any overdue missions for this team first
  await supabase.rpc("expire_overdue_missions_for_team", { p_team_id: team_id });

  const { data: state } = await supabase
    .from("team_mission_state")
    .select("state")
    .eq("team_id", team_id)
    .eq("mission_id", mission_id)
    .maybeSingle();

  if (!state || state.state !== "unlocked") {
    const reason =
      state?.state === "failed_expired"
        ? "That mission's deadline has passed."
        : "Mission is not available.";
    redirect(`/play/${join_code}?error=${encodeURIComponent(reason)}`);
  }
}

export async function submitTextAnswer(formData: FormData) {
  const { supabase, user } = await requireUser();

  const mission_id = formData.get("mission_id") as string;
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;
  const payload_text = ((formData.get("payload_text") as string) ?? "").trim();

  if (!payload_text) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=Answer+cannot+be+empty`,
    );
  }

  await ensureMissionSubmittable(supabase, team_id, mission_id, join_code);

  const { error } = await supabase.from("submissions").insert({
    mission_id,
    team_id,
    submitted_by: user.id,
    payload_text,
  });

  if (error) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/play/${join_code}`);
  redirect(`/play/${join_code}`);
}

export async function submitMedia(formData: FormData) {
  const { supabase, user } = await requireUser();

  const mission_id = formData.get("mission_id") as string;
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;
  const media_kind =
    (formData.get("media_kind") as "photo" | "video") || "photo";
  const file = formData.get("media") as File | null;

  if (!file || file.size === 0) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=Please+pick+a+${media_kind === "video" ? "video" : "photo"}`,
    );
  }

  await ensureMissionSubmittable(supabase, team_id, mission_id, join_code);

  // Look up game_id for path namespacing
  const { data: team } = await supabase
    .from("teams")
    .select("game_id")
    .eq("id", team_id)
    .single();
  if (!team) {
    redirect(`/play/${join_code}/m/${mission_id}?error=Team+not+found`);
  }

  const fallbackExt = media_kind === "video" ? "mp4" : "jpg";
  const fallbackMime = media_kind === "video" ? "video/mp4" : "image/jpeg";
  const ext = (file.name.split(".").pop() || fallbackExt)
    .toLowerCase()
    .slice(0, 4);
  const path = `${team.game_id}/${team_id}/${mission_id}/${Date.now()}-${user.id.slice(0, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("submissions")
    .upload(path, file, { contentType: file.type || fallbackMime });

  if (upErr) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=${encodeURIComponent("Upload failed: " + upErr.message)}`,
    );
  }

  const { error } = await supabase.from("submissions").insert({
    mission_id,
    team_id,
    submitted_by: user.id,
    media_path: path,
  });

  if (error) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/play/${join_code}`);
  redirect(`/play/${join_code}`);
}
