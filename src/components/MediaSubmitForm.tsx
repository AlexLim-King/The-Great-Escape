"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitMediaPath } from "@/lib/player-actions";
import MediaUploadField from "@/components/MediaUploadField";

// Photo/video submissions upload straight from the browser to Supabase
// Storage, then hand the server action only the resulting path. This
// bypasses the Next.js server-action body limit (~4.5 MB on Vercel) so
// real phone photos and video actually go through. Mirrors the pattern in
// BatchMissionUpload.
const PHOTO_MAX = 10 * 1024 * 1024; // 10 MB
const VIDEO_MAX = 50 * 1024 * 1024; // 50 MB — matches Supabase's default upload cap

function fileExt(name: string, kind: "photo" | "video"): string {
  const e = name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4);
  return e || (kind === "video" ? "mp4" : "jpg");
}

export default function MediaSubmitForm({
  kind,
  missionId,
  teamId,
  joinCode,
  gameId,
}: {
  kind: "photo" | "video";
  missionId: string;
  teamId: string;
  joinCode: string;
  gameId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = kind === "video" ? VIDEO_MAX : PHOTO_MAX;
  const maxLabel = `${Math.round(max / (1024 * 1024))} MB`;

  async function handleSubmit() {
    if (!file || busy) return;
    if (file.size > max) {
      setError(`That ${kind} is too large (max ${maxLabel}).`);
      return;
    }
    setBusy(true);
    setError(null);

    // Upload directly to Storage. The path namespace must match what
    // submitMediaPath re-validates on the server.
    const supabase = createClient();
    const path = `${gameId}/${teamId}/${missionId}/${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}.${fileExt(file.name, kind)}`;

    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(path, file, {
        contentType:
          file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      });
    if (upErr) {
      setError("Upload failed: " + upErr.message);
      setBusy(false);
      return;
    }

    const res = await submitMediaPath({
      mission_id: missionId,
      team_id: teamId,
      join_code: joinCode,
      media_path: path,
    });
    if ("error" in res) {
      setError(res.error);
      setBusy(false);
      return;
    }

    router.push(`/play/${joinCode}`);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      <MediaUploadField kind={kind} onFileSelected={setFile} />

      {kind === "video" && (
        <p className="text-xs text-subtle">
          Keep it under ~60 seconds and {maxLabel}.
        </p>
      )}

      {error && <p className="banner banner-error">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || busy}
        className="btn btn-primary btn-lg w-full sm:w-auto"
      >
        {busy
          ? "Uploading…"
          : kind === "photo"
            ? "Submit photo"
            : "Submit video"}
      </button>
    </div>
  );
}
