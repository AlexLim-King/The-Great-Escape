"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-actions";

type Notification = {
  id: string;
  user_id: string;
  game_id: string | null;
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

const MAX = 15;

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

const iconForType: Record<Notification["type"], string> = {
  submission_approved: "✓",
  submission_rejected: "✗",
  mission_unlocked: "🔓",
  mission_expired: "⌛",
  new_submission: "📨",
  gm_announcement: "📢",
};

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX);
    setItems((data ?? []) as Notification[]);
  }, [supabase, userId]);

  useEffect(() => {
    void refetch();

    // Live-prepend new notifications via realtime. Filter on user_id so
    // each tab only receives its own rows even with RLS in front.
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          setItems((prev) => [row, ...prev].slice(0, MAX));
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
          const row = payload.new as Notification;
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refetch]);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  function handleClick(n: Notification) {
    // Optimistic: mark read immediately, then navigate.
    setItems((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
      ),
    );
    startTransition(async () => {
      await markNotificationRead(n.id);
    });
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  function handleMarkAll() {
    setItems((prev) =>
      prev.map((x) =>
        x.read_at ? x : { ...x, read_at: new Date().toISOString() },
      ),
    );
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-hover transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-fg text-[10px] leading-4 text-center font-semibold"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto
            rounded-lg border border-default
            bg-surface shadow-xl z-50
          "
          role="menu"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-default sticky top-0 bg-surface">
            <p className="text-sm font-medium">Notifications</p>
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

          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-center text-muted">
              No notifications yet.
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const unread = !n.read_at;
                const row = (
                  <div
                    className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-hover text-left w-full ${
                      unread ? "" : "opacity-70"
                    }`}
                  >
                    <span
                      className="text-base leading-tight flex-none mt-0.5"
                      aria-hidden
                    >
                      {iconForType[n.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${unread ? "font-medium" : ""}`}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-muted truncate">
                          {n.body}
                        </p>
                      )}
                      <p className="text-xs text-subtle mt-0.5">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {unread && (
                      <span
                        className="w-2 h-2 rounded-full bg-accent flex-none mt-1.5"
                        aria-hidden
                      />
                    )}
                  </div>
                );
                return (
                  <li
                    key={n.id}
                    className="border-b border-default last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className="block w-full text-left"
                    >
                      {row}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
