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

export async function submitPhoto(formData: FormData) {
  const { supabase, user } = await requireUser();

  const mission_id = formData.get("mission_id") as string;
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;
  const file = formData.get("photo") as File | null;

  if (!file || file.size === 0) {
    redirect(
      `/play/${join_code}/m/${mission_id}?error=Please+pick+a+photo`,
    );
  }

  // Look up game_id for path namespacing
  const { data: team } = await supabase
    .from("teams")
    .select("game_id")
    .eq("id", team_id)
    .single();
  if (!team) {
    redirect(`/play/${join_code}/m/${mission_id}?error=Team+not+found`);
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 4);
  const path = `${team.game_id}/${team_id}/${mission_id}/${Date.now()}-${user.id.slice(0, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("submissions")
    .upload(path, file, { contentType: file.type || "image/jpeg" });

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
