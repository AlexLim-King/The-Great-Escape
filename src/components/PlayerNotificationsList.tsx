"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-actions";

export type PlayerNotification = {
  id: string;
  type:
    | "submission_approved"
    | "submission_rejected"
    | "mission_unlocked"
    | "mission_expired"
    | "new_submission"
    | "gm_announcement";
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const iconForType: Record<PlayerNotification["type"], string> = {
  submission_approved: "✓",
  submission_rejected: "✗",
  mission_unlocked: "🔓",
  mission_expired: "⌛",
  new_submission: "📨",
  gm_announcement: "📢",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Props = {
  userId: string;
  gameId: string;
  selfHref: string;
  initial: PlayerNotification[];
};

export default function PlayerNotificationsList({
  userId,
  gameId,
  selfHref,
  initial,
}: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<PlayerNotification[]>(initial);
  const [, startTransition] = useTransition();

  // Live-prepend any new notifications for this user that belong to this
  // game. The realtime filter is constrained to user_id (single condition),
  // so we also filter by game_id in the handler.
  useEffect(() => {
    const channel = supabase
      .channel(`notif-page:${userId}:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as PlayerNotification & { game_id: string | null };
          if (row.game_id !== gameId) return;
          setItems((prev) => [row, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as PlayerNotification & { game_id: string | null };
          if (row.game_id !== gameId) return;
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, gameId]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  function handleClick(n: PlayerNotification) {
    if (!n.read_at) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
      startTransition(async () => {
        await markNotificationRead(n.id);
      });
    }
    // Don't navigate if the href points back to this same page — clicking
    // a gm_announcement from within the history view would otherwise be a
    // dead-end "navigate to where I already am".
    if (n.href && n.href !== selfHref) {
      router.push(n.href);
    }
  }

  function handleMarkAll() {
    if (unreadCount === 0) return;
    setItems((prev) =>
      prev.map((x) =>
        x.read_at ? x : { ...x, read_at: new Date().toISOString() },
      ),
    );
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted py-10 text-center">
        Nothing here yet. Notifications from the GM and updates about your
        team&apos;s missions will show up here.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted">
          {unreadCount > 0
            ? `${unreadCount} unread`
            : "You're all caught up."}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-xs text-muted hover:text-text hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((n) => {
          const unread = !n.read_at;
          const isAnnouncement = n.type === "gm_announcement";
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={`w-full text-left rounded-lg border bg-surface px-3 py-2.5 flex items-start gap-3 transition-colors hover:bg-surface-hover ${
                  unread
                    ? "border-strong"
                    : "border-default opacity-75"
                }`}
              >
                <span aria-hidden className="text-base mt-0.5">
                  {iconForType[n.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${unread ? "font-medium" : ""}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p
                      className={`text-xs mt-0.5 text-muted ${
                        isAnnouncement ? "whitespace-pre-wrap" : ""
                      }`}
                    >
                      {n.body}
                    </p>
                  )}
                  <p className="text-[11px] text-subtle mt-0.5">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {unread && (
                  <span
                    aria-hidden
                    className="w-2 h-2 rounded-full bg-accent flex-none mt-2"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
