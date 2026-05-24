import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MissionForm, { type MissionInitial } from "@/components/MissionForm";
import { updateMission } from "@/lib/gm-actions";

export default async function EditMissionPage(
  props: PageProps<"/games/[id]/missions/[missionId]/edit">,
) {
  const { id, missionId } = await props.params;
  const { error } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, owner_id")
    .eq("id", id)
    .single();
  if (!game) notFound();
  if (game.owner_id !== user.id) redirect("/games");

  // Fetch the mission being edited along with its current team assignments
  // and the small lists the form needs (other missions for the prereq
  // dropdown, teams for the assignment checkboxes).
  const [
    { data: mission },
    { data: assignments },
    { data: missions },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("missions")
      .select(
        "id, game_id, title, description, points, submission_type, validation_mode, expected_answer, unlock_groups, unlock_after, reference_links, assignment_mode, deadline_mode, deadline_at, deadline_duration_sec, reference_image_path",
      )
      .eq("id", missionId)
      .single(),
    supabase
      .from("mission_team_assignments")
      .select("team_id")
      .eq("mission_id", missionId),
    supabase
      .from("missions")
      .select("id, title")
      .eq("game_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("game_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!mission) notFound();
  if (mission.game_id !== id) notFound();

  // Sign the existing reference image so the form can show a thumbnail
  let referenceUrl: string | null = null;
  if (mission.reference_image_path) {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(mission.reference_image_path, 60 * 60);
    referenceUrl = data?.signedUrl ?? null;
  }

  // Generated DB types widen the enum-like columns to plain `string` and
  // `unlock_groups` to Json. The CHECK constraint and the migration
  // guarantee the runtime shapes; narrow here.
  const initial: MissionInitial = {
    title: mission.title,
    description: mission.description,
    points: mission.points,
    submission_type: mission.submission_type as MissionInitial["submission_type"],
    validation_mode: mission.validation_mode as MissionInitial["validation_mode"],
    expected_answer: mission.expected_answer,
    unlock_groups: (mission.unlock_groups ?? []) as string[][],
    unlock_after: mission.unlock_after,
    reference_links: (mission.reference_links ?? []) as MissionInitial["reference_links"],
    assignment_mode: mission.assignment_mode as MissionInitial["assignment_mode"],
    deadline_mode: mission.deadline_mode as MissionInitial["deadline_mode"],
    deadline_at: mission.deadline_at,
    deadline_duration_sec: mission.deadline_duration_sec,
  };

  const initialTeamIds = (assignments ?? []).map((a) => a.team_id);

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <Link
        href={`/games/${id}`}
        className="text-sm text-muted hover:text-text"
      >
        ← {game.name}
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4 tracking-tight">
        Edit mission
      </h1>

      {error && <p className="banner banner-error mb-4">{error}</p>}

      <MissionForm
        gameId={game.id}
        missions={missions ?? []}
        teams={teams ?? []}
        action={updateMission}
        submitLabel="Save changes"
        missionId={mission.id}
        initial={initial}
        initialTeamIds={initialTeamIds}
        currentReferenceImageUrl={referenceUrl}
      />
    </main>
  );
}
