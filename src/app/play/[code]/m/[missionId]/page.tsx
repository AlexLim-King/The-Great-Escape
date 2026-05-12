import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitTextAnswer, submitMedia } from "@/lib/player-actions";
import Countdown from "@/components/Countdown";
import MediaUploadField from "@/components/MediaUploadField";

export default async function SubmitMissionPage(
  props: PageProps<"/play/[code]/m/[missionId]">,
) {
  const { code: rawCode, missionId } = await props.params;
  const { error } = await props.searchParams;
  const code = rawCode.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name")
    .eq("join_code", code)
    .single();
  if (!game) notFound();

  const { data: mission } = await supabase
    .from("missions")
    .select(
      "id, title, description, points, submission_type, validation_mode, reference_image_path, reference_links, game_id",
    )
    .eq("id", missionId)
    .single();
  if (!mission || mission.game_id !== game.id) notFound();

  // Find the user's team in this game
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("game_id", game.id);
  const teamIds = (teams ?? []).map((t) => t.id);

  let myTeamId: string | null = null;
  if (teamIds.length > 0) {
    const { data: myMembership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .in("team_id", teamIds)
      .maybeSingle();
    myTeamId = myMembership?.team_id ?? null;
  }

  if (!myTeamId) redirect(`/play/${code}`);

  // Lazy state refresh: expire overdue, then recompute so time gates and
  // newly-eligible unlocks are honored before the gate check below.
  await supabase.rpc("expire_overdue_missions_for_team", {
    p_team_id: myTeamId,
  });
  await supabase.rpc("recompute_team_mission_state", {
    p_team_id: myTeamId,
  });

  // Check mission state for the team
  const { data: state } = await supabase
    .from("team_mission_state")
    .select("state, expires_at")
    .eq("team_id", myTeamId)
    .eq("mission_id", missionId)
    .maybeSingle();

  if (!state || state.state === "locked")
    redirect(`/play/${code}?error=Mission+not+available`);
  if (state.state === "approved" || state.state === "submitted")
    redirect(`/play/${code}`);
  if (state.state === "failed_expired")
    redirect(`/play/${code}?error=${encodeURIComponent("That mission's deadline has passed.")}`);

  // Reference image (signed URL, valid for 1 hour)
  let referenceUrl: string | null = null;
  if (mission.reference_image_path) {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(mission.reference_image_path, 60 * 60);
    referenceUrl = data?.signedUrl ?? null;
  }

  const isPhoto = mission.submission_type === "photo";
  const isVideo = mission.submission_type === "video";
  const isMedia = isPhoto || isVideo;

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <Link href={`/play/${code}`} className="text-sm hover:underline">
        ← {game.name}
      </Link>
      <h1 className="text-2xl font-semibold mt-2">{mission.title}</h1>
      {mission.description && (
        <p className="text-black/70 dark:text-white/70 mt-1 whitespace-pre-wrap">
          {mission.description}
        </p>
      )}
      <p className="text-xs text-black/50 dark:text-white/50 mt-1 flex items-center gap-2 flex-wrap">
        <span>
          {mission.points} pts ·{" "}
          {mission.validation_mode === "auto" ? "auto-checked" : "GM judged"}
        </span>
        {state.expires_at && <Countdown expiresAt={state.expires_at} />}
      </p>

      {referenceUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={referenceUrl}
          alt="Mission reference"
          className="mt-4 w-full rounded border border-black/10 dark:border-white/10"
        />
      )}

      {(() => {
        const links =
          (mission.reference_links ?? []) as { label: string; url: string }[];
        if (links.length === 0) return null;
        return (
          <div className="mt-4">
            <p className="text-xs text-black/55 dark:text-white/55 mb-1.5">
              References
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {links.map((l, i) => (
                <li key={i}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-black/15 dark:border-white/15 px-2.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mt-4">
          {error}
        </p>
      )}

      {mission.submission_type === "text" ? (
        <form action={submitTextAnswer} className="mt-6 space-y-3">
          <input type="hidden" name="mission_id" value={mission.id} />
          <input type="hidden" name="team_id" value={myTeamId} />
          <input type="hidden" name="join_code" value={code} />
          <label className="block">
            <span className="text-sm">Your answer</span>
            <textarea
              name="payload_text"
              rows={3}
              required
              className="mt-1 block w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-foreground text-background px-4 py-2 font-medium"
          >
            Submit answer
          </button>
        </form>
      ) : isMedia ? (
        <form action={submitMedia} className="mt-6 space-y-4">
          <input type="hidden" name="mission_id" value={mission.id} />
          <input type="hidden" name="team_id" value={myTeamId} />
          <input type="hidden" name="join_code" value={code} />
          <input
            type="hidden"
            name="media_kind"
            value={isPhoto ? "photo" : "video"}
          />

          <MediaUploadField kind={isPhoto ? "photo" : "video"} />

          {isVideo && (
            <p className="text-xs text-black/50 dark:text-white/50">
              Keep it under ~60 seconds and 100 MB.
            </p>
          )}

          <button
            type="submit"
            className="w-full sm:w-auto rounded bg-foreground text-background px-4 py-2.5 font-medium"
          >
            {isPhoto ? "Submit photo" : "Submit video"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
