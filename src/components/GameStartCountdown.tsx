"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Counts down to a game's scheduled start. When it reaches zero it calls
 * router.refresh() once — the server then runs refresh_game_status, flips
 * the game to 'active', and the page re-renders live. No cron needed.
 */
export default function GameStartCountdown({
  startsAt,
  className = "",
}: {
  startsAt: string;
  className?: string;
}) {
  const router = useRouter();
  const target = new Date(startsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const refreshed = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((target - now) / 1000));

  useEffect(() => {
    if (remaining === 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {remaining === 0 ? "starting…" : fmt(remaining)}
    </span>
  );
}
