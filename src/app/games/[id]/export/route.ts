import { createClient } from "@/lib/supabase/server";
import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";

// Export downloads for a game (owner-only). A GET route handler — not a
// server action — because we're returning file downloads, hit via a plain
// <a download> link:
//   ?type=submissions  → CSV log of every submission       (default)
//   ?type=leaderboard  → CSV of the leaderboard
//   ?type=media        → ZIP of all photo/video files, foldered per team
//
// The media ZIP is *streamed* (archiver → PassThrough → web stream) so a
// big set of videos never has to fit in memory at once.

// Reads storage objects + streams a response — run dynamically on the Node
// runtime (archiver + node:stream are Node-only).
export const dynamic = "force-dynamic";

function one<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Strip filesystem-illegal characters from a path segment; collapse
 *  whitespace. Keeps spaces and dashes so names stay human-readable. */
function safeSegment(s: string, fallback: string): string {
  const cleaned = (s ?? "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .]+$/, "");
  return cleaned || fallback;
}

/** File extension from a storage path, falling back by submission type. */
function extFor(path: string, type: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(path);
  if (m) return m[1].toLowerCase();
  return type === "video" ? "mp4" : "jpg";
}

function gameSlug(gameName: string): string {
  return (
    gameName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "game"
  );
}

/** RFC-4180-ish field escaping: quote when needed, double inner quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  // Lead with a BOM so Excel reads UTF-8 correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function downloadName(gameName: string, kind: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${gameSlug(gameName)}-${kind}-${date}.${ext}`;
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const typeParam = new URL(request.url).searchParams.get("type");
  const type =
    typeParam === "leaderboard"
      ? "leaderboard"
      : typeParam === "media"
        ? "media"
        : "submissions";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: game } = await supabase
    .from("games")
    .select("id, name, owner_id")
    .eq("id", id)
    .single();
  if (!game) return new Response("Not found", { status: 404 });
  if (game.owner_id !== user.id)
    return new Response("Forbidden", { status: 403 });

  // Keep derived state fresh before snapshotting it.
  await supabase.rpc("refresh_game_state", { p_game_id: id });

  // ── Media ZIP ─────────────────────────────────────────────────────────────
  if (type === "media") {
    const { data: rawMedia } = await supabase
      .from("submissions")
      .select(
        "id, media_path, created_at, missions!inner(title, submission_type, game_id), teams!inner(name)",
      )
      .eq("missions.game_id", id)
      .order("created_at", { ascending: true });

    // Keep only photo/video submissions that actually have a stored file.
    const media = (rawMedia ?? []).filter((s) => {
      const m = one(s.missions);
      return (
        s.media_path &&
        (m?.submission_type === "photo" || m?.submission_type === "video")
      );
    });

    if (media.length === 0) {
      return new Response("No photo or video submissions to download yet.", {
        status: 404,
      });
    }

    // Resolve each file's archive path: "<Team>/<Team> - <Mission>.ext",
    // de-duping when a team has several submissions for one mission.
    const used = new Set<string>();
    const entries = media.map((s) => {
      const m = one(s.missions)!;
      const team = one(s.teams)!;
      const folder = safeSegment(team.name, "Team");
      const base = `${folder} - ${safeSegment(m.title, "Mission")}`;
      const ext = extFor(s.media_path!, m.submission_type);
      let name = `${folder}/${base}.${ext}`;
      let n = 2;
      while (used.has(name.toLowerCase())) {
        name = `${folder}/${base} (${n}).${ext}`;
        n++;
      }
      used.add(name.toLowerCase());
      return { path: s.media_path as string, name };
    });

    // store: true → no compression (photos/videos are already compressed,
    // so deflate would just burn CPU for ~0 gain).
    const archive = archiver("zip", { store: true });
    const pass = new PassThrough();
    archive.on("warning", (err) =>
      console.warn("[media-zip] warning", err?.message),
    );
    archive.on("error", (err) => {
      console.error("[media-zip] archive error", err);
      pass.destroy(err);
    });
    archive.pipe(pass);

    // Feed the archive in the background so the Response can start streaming
    // immediately; backpressure flows from the client through PassThrough.
    void (async () => {
      try {
        for (const e of entries) {
          const { data, error } = await supabase.storage
            .from("submissions")
            .download(e.path);
          if (error || !data) {
            console.warn("[media-zip] skipped", e.path, error?.message);
            continue;
          }
          const buf = Buffer.from(await data.arrayBuffer());
          archive.append(buf, { name: e.name });
        }
        await archive.finalize();
      } catch (err) {
        console.error("[media-zip] feed error", err);
        archive.abort();
      }
    })();

    const webStream = Readable.toWeb(
      pass,
    ) as unknown as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${downloadName(
          game.name,
          "media",
          "zip",
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Leaderboard CSV ─────────────────────────────────────────────────────
  if (type === "leaderboard") {
    const { data, error } = await supabase.rpc("game_leaderboard", {
      p_game_id: id,
    });
    if (error) return new Response(error.message, { status: 500 });
    const rows = (data ?? []) as Array<{
      team_name: string;
      score: number;
      completed: number;
    }>;
    const csv = toCsv(
      ["Rank", "Team", "Score", "Completed missions"],
      rows.map((r, i) => [i + 1, r.team_name, r.score, r.completed]),
    );
    return csvResponse(csv, downloadName(game.name, "leaderboard", "csv"));
  }

  // ── Submissions CSV ─────────────────────────────────────────────────────
  const { data: subs } = await supabase
    .from("submissions")
    .select(
      "id, status, payload_text, media_path, bonus_points, feedback, created_at, verified_at, submitted_by, missions!inner(title, points, submission_type, game_id), teams!inner(name)",
    )
    .eq("missions.game_id", id)
    .order("created_at", { ascending: true });

  const list = subs ?? [];

  // Resolve submitter display names in one round-trip.
  const submitterNames = new Map<string, string>();
  const submitterIds = Array.from(
    new Set(list.map((s) => s.submitted_by).filter(Boolean)),
  ) as string[];
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", submitterIds);
    for (const p of profiles ?? []) submitterNames.set(p.id, p.display_name);
  }

  const csv = toCsv(
    [
      "Mission",
      "Team",
      "Status",
      "Type",
      "Base points",
      "Bonus points",
      "Submitted by",
      "Submitted at",
      "Verified at",
      "Answer / text",
      "Media path",
      "Feedback",
    ],
    list.map((s) => {
      const m = one(s.missions)!;
      const team = one(s.teams)!;
      return [
        m.title,
        team.name,
        s.status,
        m.submission_type,
        m.points,
        s.bonus_points,
        s.submitted_by ? (submitterNames.get(s.submitted_by) ?? "") : "",
        s.created_at,
        s.verified_at ?? "",
        s.payload_text ?? "",
        s.media_path ?? "",
        s.feedback ?? "",
      ];
    }),
  );
  return csvResponse(csv, downloadName(game.name, "submissions", "csv"));
}
