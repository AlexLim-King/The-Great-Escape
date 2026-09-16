import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabNav from "@/components/TabNav";
import { gmTabs } from "@/lib/gm-tabs";
import GameSettingsForm from "@/components/GameSettingsForm";
import GameStartCountdown from "@/components/GameStartCountdown";
import StartScheduler from "@/components/StartScheduler";
import {
  setGameStatus,
  cancelGameStart,
  setGameImage,
} from "@/lib/gm-actions";

/** ISO (UTC) → local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function one<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const STATUS_PILL: Record<string, string> = {
  draft: "pill pill-neutral",
  active: "pill pill-success",
  paused: "pill pill-warn",
  ended: "pill pill-danger",
};

export default async function GameSettingsPage(
  props: PageProps<"/games/[id]/settings">,
) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const error = one(sp.error) ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select(
      "id, name, description, location, status, starts_at, ends_at, theme, image_path, owner_id",
    )
    .eq("id", id)
    .single();
  if (!game) notFound();
  if (game.owner_id !== user.id) redirect("/games");

  let coverUrl: string | null = null;
  if (game.image_path) {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(game.image_path, 60 * 60);
    coverUrl = data?.signedUrl ?? null;
  }

  // Reflect any due scheduled start.
  const { data: refreshedStatus } = await supabase.rpc("refresh_game_status", {
    p_game_id: game.id,
  });
  const status = (refreshedStatus as string | null) ?? game.status;

  // Post-refresh, draft + starts_at ⟹ scheduled for the future.
  const scheduledStart =
    status === "draft" && game.starts_at ? game.starts_at : null;

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
      <header>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold mt-2 tracking-tight">
          {game.name}
        </h1>
      </header>

      <TabNav current="Settings" tabs={gmTabs(game.id)} />

      {error && <p className="banner banner-error">{error}</p>}

      {/* Lifecycle / status */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Status</h2>
          <span className={STATUS_PILL[status] ?? "pill pill-neutral"}>
            {status}
          </span>
        </div>

        {status === "draft" ? (
          scheduledStart ? (
            // Scheduled — countdown + start-now / cancel.
            <div className="space-y-3">
              <p className="text-sm flex items-center gap-2 flex-wrap">
                🚀 <span className="text-muted">Starts</span>
                <span className="font-medium">
                  {new Date(scheduledStart).toLocaleString()}
                </span>
                <span className="text-muted">· in</span>
                <GameStartCountdown
                  startsAt={scheduledStart}
                  className="font-semibold"
                />
              </p>
              <div className="flex items-center gap-2">
                <form action={setGameStatus}>
                  <input type="hidden" name="game_id" value={game.id} />
                  <input type="hidden" name="status" value="active" />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Start now
                  </button>
                </form>
                <form action={cancelGameStart}>
                  <input type="hidden" name="game_id" value={game.id} />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Cancel schedule
                  </button>
                </form>
              </div>
            </div>
          ) : (
            // Not started — start now, or schedule a start (relative/absolute).
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Not started yet — players can join teams but can&apos;t submit.
              </p>
              <form action={setGameStatus}>
                <input type="hidden" name="game_id" value={game.id} />
                <input type="hidden" name="status" value="active" />
                <button type="submit" className="btn btn-primary btn-sm">
                  Start now
                </button>
              </form>
              <div className="border-t border-default pt-3">
                <p className="text-xs text-muted mb-2">…or schedule the start</p>
                <StartScheduler gameId={game.id} />
              </div>
            </div>
          )
        ) : (
          // active / paused / ended transitions
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {status === "active"
                ? "Live — players can submit to unlocked missions."
                : status === "paused"
                  ? "Paused — submissions are closed until you resume."
                  : "Ended — submissions are closed."}
            </p>
            <div className="flex items-center gap-2">
              {status === "active" && (
                <>
                  <StatusButton gameId={game.id} to="paused" label="Pause" variant="btn-secondary" />
                  <StatusButton gameId={game.id} to="ended" label="End game" variant="btn-danger" />
                </>
              )}
              {status === "paused" && (
                <>
                  <StatusButton gameId={game.id} to="active" label="Resume" variant="btn-primary" />
                  <StatusButton gameId={game.id} to="ended" label="End game" variant="btn-danger" />
                </>
              )}
              {status === "ended" && (
                <StatusButton gameId={game.id} to="active" label="Reopen" variant="btn-secondary" />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Cover image */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cover image</h2>
        <div className="flex items-start gap-4 flex-wrap">
          {coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverUrl}
              alt="Game cover"
              className="w-40 aspect-video object-cover rounded-lg border border-default flex-none"
            />
          ) : (
            <div className="w-40 aspect-video rounded-lg border border-dashed border-strong bg-surface-muted flex items-center justify-center text-2xl text-subtle flex-none">
              🖼
            </div>
          )}
          <div className="space-y-2">
            <form action={setGameImage} className="flex items-center gap-2 flex-wrap">
              <input type="hidden" name="game_id" value={game.id} />
              <input
                type="file"
                name="image"
                accept="image/*"
                required
                className="text-sm"
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                {coverUrl ? "Replace" : "Upload"}
              </button>
            </form>
            {coverUrl && (
              <form action={setGameImage}>
                <input type="hidden" name="game_id" value={game.id} />
                <input type="hidden" name="remove" value="1" />
                <button
                  type="submit"
                  className="text-sm text-danger hover:underline"
                >
                  Remove image
                </button>
              </form>
            )}
            <p className="text-xs text-muted max-w-xs">
              Shown full-width to players on the join screen — helps them
              recognise the game. For sharp, fast-loading results on mobile,
              use a landscape <strong>16:9</strong> image around{" "}
              <strong>1200&nbsp;×&nbsp;675&nbsp;px</strong>. JPG or PNG, up to
              10 MB.
            </p>
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Details</h2>
        <GameSettingsForm
          gameId={game.id}
          initial={{
            name: game.name,
            description: game.description ?? "",
            location: game.location ?? "",
            ends_at: toLocalInput(game.ends_at),
            theme: game.theme ?? "default",
          }}
        />
      </section>
    </main>
  );
}

function StatusButton({
  gameId,
  to,
  label,
  variant,
}: {
  gameId: string;
  to: string;
  label: string;
  variant: string;
}) {
  return (
    <form action={setGameStatus}>
      <input type="hidden" name="game_id" value={gameId} />
      <input type="hidden" name="status" value={to} />
      <button type="submit" className={`btn btn-sm ${variant}`}>
        {label}
      </button>
    </form>
  );
}
