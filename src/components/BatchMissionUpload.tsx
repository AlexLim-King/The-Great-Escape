"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createMissionsBatch } from "@/lib/gm-actions";

type ItemStatus = "ready" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  title: string;
  previewUrl: string;
  status: ItemStatus;
  error?: string;
};

const MAX_FILES = 100;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image (matches PRD photo cap)

/** "a-station_game ball.JPG" → "A Station Game Ball" */
function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled mission";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function ext(name: string): string {
  const e = name.split(".").pop()?.toLowerCase() ?? "jpg";
  return e.replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
}

export default function BatchMissionUpload({ gameId }: { gameId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [points, setPoints] = useState(100);
  const [submissionType, setSubmissionType] = useState<
    "photo" | "text" | "video"
  >("photo");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    const images = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (images.length === 0) {
      setError("No image files found in that selection.");
      return;
    }

    const oversize = images.filter((f) => f.size > MAX_BYTES).length;
    const usable = images.filter((f) => f.size <= MAX_BYTES);

    // Additive: each pick adds to the set rather than replacing it, so you
    // can select a few images at a time (or add a folder, then trim).
    // Dedupe by name + size so re-picking the same file is a no-op.
    let truncated = false;
    setItems((prev) => {
      const seen = new Set(prev.map((it) => `${it.file.name}:${it.file.size}`));
      const additions: Item[] = [];
      for (const f of usable) {
        const key = `${f.name}:${f.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        additions.push({
          id: crypto.randomUUID(),
          file: f,
          title: titleFromFilename(f.name),
          previewUrl: URL.createObjectURL(f),
          status: "ready",
        });
      }
      const combined = [...prev, ...additions];
      if (combined.length > MAX_FILES) {
        truncated = true;
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });

    const notes: string[] = [];
    if (oversize > 0) notes.push(`${oversize} over 10 MB skipped`);
    if (truncated) notes.push(`capped at ${MAX_FILES} images`);
    if (notes.length > 0) setError(notes.join(" · "));
  }

  function setTitle(id: string, title: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const found = prev.find((it) => it.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }

  function patch(id: string, p: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  async function handleCreate() {
    if (items.length === 0 || working) return;
    setWorking(true);
    setError(null);

    const created: {
      title: string;
      reference_image_path: string;
      points: number;
      submission_type: "text" | "photo" | "video";
    }[] = [];

    for (const it of items) {
      patch(it.id, { status: "uploading", error: undefined });
      const path = `mission-media/${gameId}/batch/${Date.now()}-${it.id}.${ext(
        it.file.name,
      )}`;
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(path, it.file, {
          contentType: it.file.type || "image/jpeg",
        });
      if (upErr) {
        patch(it.id, { status: "error", error: upErr.message });
        continue;
      }
      patch(it.id, { status: "done" });
      created.push({
        title: it.title,
        reference_image_path: path,
        points,
        submission_type: submissionType,
      });
    }

    if (created.length === 0) {
      setError("All uploads failed — nothing was created.");
      setWorking(false);
      return;
    }

    const res = await createMissionsBatch(gameId, created);
    if (res.error) {
      setError(res.error);
      setWorking(false);
      return;
    }

    // Back to Setup, which is revalidated server-side.
    router.push(`/games/${gameId}`);
  }

  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className="space-y-5">
      {/* Pickers + shared defaults */}
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={working}
            onClick={() => filesInputRef.current?.click()}
            className="btn btn-primary btn-sm"
          >
            Select images
          </button>
          {items.length > 0 && (
            <span className="text-xs text-muted">
              {items.length} selected · pick more to add to the set
            </span>
          )}

          {/* Multi-select picker: choose any number of individual images
              (use Select All in the OS dialog to grab a whole folder's
              worth). Clearing value after each pick lets you re-select a
              file you previously removed. */}
          <input
            ref={filesInputRef}
            data-testid="batch-files-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-sm">Points each</span>
            <input
              type="number"
              min={0}
              value={points}
              disabled={working}
              onChange={(e) => setPoints(parseInt(e.target.value, 10) || 0)}
              className="mt-1 input w-28"
            />
          </label>
          <label className="block">
            <span className="text-sm">Submission type</span>
            <select
              value={submissionType}
              disabled={working}
              onChange={(e) =>
                setSubmissionType(
                  e.target.value as "photo" | "text" | "video",
                )
              }
              className="mt-1 select w-40"
            >
              <option value="photo">Photo</option>
              <option value="text">Text</option>
              <option value="video">Video</option>
            </select>
          </label>
          <p className="text-xs text-muted max-w-xs">
            Each image becomes a GM-judged mission&apos;s reference image,
            titled from its file name. Edit anything below before creating.
          </p>
        </div>

        {error && <p className="banner banner-error">{error}</p>}
      </section>

      {/* Preview / edit grid */}
      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">
              {items.length} {items.length === 1 ? "mission" : "missions"} to
              create
            </h2>
            <button
              type="button"
              disabled={working}
              onClick={handleCreate}
              className="btn btn-primary"
            >
              {working
                ? `Creating… (${doneCount}/${items.length})`
                : `Create ${items.length} ${
                    items.length === 1 ? "mission" : "missions"
                  }`}
            </button>
          </div>

          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((it) => (
              <li key={it.id} className="card card-compact space-y-2">
                <div className="aspect-[4/3] bg-surface-muted rounded-md overflow-hidden relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {it.status === "done" && (
                    <span className="absolute top-1.5 right-1.5 pill pill-success">
                      ✓
                    </span>
                  )}
                  {it.status === "uploading" && (
                    <span className="absolute top-1.5 right-1.5 pill pill-warn">
                      …
                    </span>
                  )}
                  {it.status === "error" && (
                    <span className="absolute top-1.5 right-1.5 pill pill-danger">
                      !
                    </span>
                  )}
                </div>
                <input
                  value={it.title}
                  disabled={working}
                  onChange={(e) => setTitle(it.id, e.target.value)}
                  className="input text-sm"
                  aria-label="Mission title"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-subtle truncate max-w-[60%]">
                    {it.file.name}
                  </span>
                  {!working && (
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  {it.error && (
                    <span className="text-xs text-danger" title={it.error}>
                      failed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
