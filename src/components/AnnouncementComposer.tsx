"use client";

import { useRef, useState } from "react";
import { broadcastAnnouncement } from "@/lib/gm-actions";

type Props = {
  gameId: string;
  tab: string;
  recipientCount: number;
  sent?: number | null;
  error?: string | null;
};

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export default function AnnouncementComposer({
  gameId,
  tab,
  recipientCount,
  sent,
  error,
}: Props) {
  // `explicitOpen` is the user's toggle state. The composer is also
  // force-opened whenever an error flash is present, so the GM can see
  // the message — that's derived in render rather than via an effect.
  // The composer is keyed on `sent` from the parent, so a successful send
  // remounts this component — clearing title/body/open without an effect.
  const [explicitOpen, setExplicitOpen] = useState(false);
  const open = explicitOpen || Boolean(error);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <section className="rounded-lg border border-default bg-surface">
      <button
        type="button"
        onClick={() => setExplicitOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover rounded-t-lg transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            📢
          </span>
          <span className="font-medium">Announcement</span>
          <span className="text-xs text-muted">
            Broadcast to {recipientCount}{" "}
            {recipientCount === 1 ? "player" : "players"}
          </span>
        </span>
        <span className="text-xs text-muted">
          {open ? "Hide" : "Compose"}
        </span>
      </button>

      {/* Status messages stay visible even when collapsed */}
      {(sent != null || error) && (
        <div className="px-4 pb-2 space-y-1">
          {sent != null && (
            <p className="banner banner-success">
              ✓ Sent to {sent} {sent === 1 ? "player" : "players"}.
            </p>
          )}
          {error && <p className="banner banner-error">{error}</p>}
        </div>
      )}

      {open && (
        <form
          ref={formRef}
          action={broadcastAnnouncement}
          className="px-4 pb-4 space-y-3 border-t border-default pt-3"
        >
          <input type="hidden" name="game_id" value={gameId} />
          <input type="hidden" name="tab" value={tab} />

          <div>
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              required
              maxLength={TITLE_MAX}
              placeholder="Title (e.g. “15 minutes left”)"
              className="input"
            />
            <p className="text-[10px] text-subtle text-right mt-0.5">
              {title.length}/{TITLE_MAX}
            </p>
          </div>

          <div>
            <textarea
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
              maxLength={BODY_MAX}
              rows={3}
              placeholder="Optional message — extra context for the players"
              className="textarea resize-y"
            />
            <p className="text-[10px] text-subtle text-right mt-0.5">
              {body.length}/{BODY_MAX}
            </p>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted">
              Goes to every team member&apos;s notification bell instantly.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTitle("");
                  setBody("");
                }}
                className="btn btn-ghost btn-sm"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={!title.trim() || recipientCount === 0}
                className="btn btn-primary"
                title={
                  recipientCount === 0
                    ? "No players have joined a team yet."
                    : undefined
                }
              >
                Send announcement
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
