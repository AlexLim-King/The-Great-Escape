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
            border-strong bg-surface-muted
            hover:bg-surface-hover hover:border-accent
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
              <p className="text-xs text-muted mt-1">
                or pick one from your device
              </p>
            </div>
          </div>
        </label>
      ) : (
        <div className="rounded-xl border border-default bg-surface overflow-hidden">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Selected"
              className="block w-full max-h-72 object-contain bg-surface-muted"
            />
          ) : (
            <div className="flex items-center gap-3 px-4 py-6">
              {kind === "photo" ? <CameraIcon small /> : <VideoIcon small />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted">
                  {formatBytes(file.size)}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-default bg-surface-muted">
            <p className="text-xs text-muted truncate">
              ✓ {file.name} · {formatBytes(file.size)}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn btn-secondary btn-sm"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clearFile}
                className="btn btn-ghost btn-sm"
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
      className="text-muted"
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
      className="text-muted"
      aria-hidden
    >
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  );
}
