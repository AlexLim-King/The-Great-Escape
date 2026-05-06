"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function MediaUploadField({
  kind,
  name = "media",
}: {
  kind: "photo" | "video";
  /** Form field name — must match what the server action reads. */
  name?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Image preview: build a blob URL when the file is an image
  useEffect(() => {
    if (file && kind === "photo" && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file, kind]);

  function clearFile() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const empty = !file;

  return (
    <>
      {/*
        The file input is the source of truth for form submission and is
        always mounted (so the picked file survives state changes). It's
        visually hidden — the label below acts as the click target in the
        empty state, and the "Change" button in the filled state.
      */}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={kind === "photo" ? "image/*" : "video/*"}
        capture="environment"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="sr-only"
      />

      {empty ? (
        <label
          htmlFor={inputId}
          className="
            block cursor-pointer rounded-xl border-2 border-dashed
            border-black/20 dark:border-white/25
            bg-black/[0.02] dark:bg-white/[0.03]
            hover:bg-black/[0.05] dark:hover:bg-white/[0.06]
            hover:border-black/30 dark:hover:border-white/40
            px-4 py-10 text-center transition-colors
          "
        >
          <div className="flex flex-col items-center justify-center gap-3">
            {kind === "photo" ? <CameraIcon /> : <VideoIcon />}
            <div>
              <p className="font-medium">
                {kind === "photo"
                  ? "Tap to take a photo"
                  : "Tap to record a video"}
              </p>
              <p className="text-xs text-black/60 dark:text-white/60 mt-1">
                or pick one from your device
              </p>
            </div>
          </div>
        </label>
      ) : (
        <div className="rounded-xl border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Selected"
              className="block w-full max-h-72 object-contain bg-black/5 dark:bg-white/5"
            />
          ) : (
            <div className="flex items-center gap-3 px-4 py-6">
              {kind === "photo" ? <CameraIcon small /> : <VideoIcon small />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-black/60 dark:text-white/60">
                  {formatBytes(file.size)}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
            <p className="text-xs text-black/70 dark:text-white/70 truncate">
              ✓ {file.name} · {formatBytes(file.size)}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs rounded border border-black/15 dark:border-white/15 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clearFile}
                className="text-xs rounded border border-black/15 dark:border-white/15 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CameraIcon({ small = false }: { small?: boolean }) {
  const size = small ? 20 : 32;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-black/60 dark:text-white/60"
      aria-hidden
    >
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function VideoIcon({ small = false }: { small?: boolean }) {
  const size = small ? 20 : 32;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-black/60 dark:text-white/60"
      aria-hidden
    >
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  );
}
