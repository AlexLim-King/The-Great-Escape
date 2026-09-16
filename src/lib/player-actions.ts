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
  const { supabase } = await requireUser();
  const team_id = formData.get("team_id") as string;
  const join_code = formData.get("join_code") as string;
  const password = ((formData.get("password") as string) ?? "").trim();

  // RPC handles both password verification (if set) and the membership insert
  // atomically with elevated privileges.
  const { data: result, error } = await supabase.rpc(
    "join_team_with_password",
    {
      p_team_id: team_id,
      p_password: password,
    },
  );

  if (error) {
    redirect(`/play/${join_code}?error=${encodeURIComponent(error.message)}`);
  }
  if (result === "wrong_password") {
    redirect(
      `/play/${join_code}?error=${encodeURIComponent("Wrong password — ask your GM.")}`,
    );
  }
  if (result === "not_found") {
    redirect(`/play/${join_code}?error=Team+not+found`);
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

/**
 * Returns an error message if the mission can't be submitted right now
 * (game not active, mission locked/expired), else null. Also performs the
 * lazy status/state refresh side effects. Callers choose whether to
 * redirect (form actions) or return the message (client-invoked actions).
 */
async function missionSubmittableError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  team_id: string,
  mission_id: string,
): Promise<string | null> {
  // Submissions are only open while the game is 'active'. First let any
  // scheduled start that's now due flip the game live, then gate.
  const { data: teamRow } = await supabase
    .from("teams")
    .select("game_id")
    .eq("id", team_id)
    .single();
  if (teamRow) {
    const { data: status } = await supabase.rpc("refresh_game_status", {
      p_game_id: teamRow.game_id,
    });
    if (status && status !== "active") {
      return status === "paused"
        ? "The game is paused — submissions are closed."
        : status === "ended"
          ? "The game has ended — submissions are closed."
          : "The game hasn't started yet.";
    }
  }

  // Sweep any overdue missions and re-evaluate unlocks (so a freshly-
  // opened time gate or newly-satisfied unlock group counts as 'unlocked'
  // by the time the state check below runs).
  await supabase.rpc("expire_overdue_missions_for_team", { p_team_id: team_id });
  await supabase.rpc("recompute_team_mission_state", { p_team_id: team_id });

  const { data: state } = await supabase
    .from("team_mission_state")
    .select("state")
    .eq("team_id", team_id)
    .eq("mission_id", mission_id)
    .maybeSingle();

  if (!state || state.state !== "unlocked") {
    return state?.state === "failed_expired"
      ? "That mission's deadline has passed."
      : "Mission is not available.";
  }
  return null;
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

  const gateErr = await missionSubmittableError(supabase, team_id, mission_id);
  if (gateErr) {
    redirect(`/play/${join_code}?error=${encodeURIComponent(gateErr)}`);
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

/**
 * Record a player photo/video submission. The browser uploads the file
 * straight to Supabase Storage (bypassing the server-action body limit —
 * ~4.5 MB on Vercel — so real phone media goes through) and calls this with
 * just the resulting storage path. We re-check submittability, verify the
 * path lives in this team+mission's namespace, then insert the row.
 *
 * Client-invoked (like createMissionsBatch), so it returns an error string
 * instead of redirecting — the caller can show it inline without discarding
 * the already-uploaded file.
 */
export async function submitMediaPath(args: {
  mission_id: string;
  team_id: string;
  join_code: string;
  media_path: string;
}): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await requireUser();
  const { mission_id, team_id, join_code, media_path } = args;

  if (!media_path || media_path.includes("..")) {
    return { error: "Invalid upload path." };
  }

  const gateErr = await missionSubmittableError(supabase, team_id, mission_id);
  if (gateErr) return { error: gateErr };

  // Storage RLS is bucket-wide, so verify the reported path is actually in
  // this team+mission's namespace before trusting it into a row.
  const { data: team } = await supabase
    .from("teams")
    .select("game_id")
    .eq("id", team_id)
    .single();
  if (!team) return { error: "Team not found." };

  const prefix = `${team.game_id}/${team_id}/${mission_id}/`;
  if (!media_path.startsWith(prefix)) {
    return { error: "Upload path didn't match this mission." };
  }

  const { error } = await supabase.from("submissions").insert({
    mission_id,
    team_id,
    submitted_by: user.id,
    media_path,
  });
  if (error) return { error: error.message };

  revalidatePath(`/play/${join_code}`);
  return { ok: true };
}
