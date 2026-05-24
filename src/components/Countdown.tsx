"use client";

import { useEffect, useState } from "react";

function format(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Countdown({
  expiresAt,
  className = "",
}: {
  /** ISO-8601 timestamp string */
  expiresAt: string;
  className?: string;
}) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingSec = Math.max(0, Math.floor((target - now) / 1000));
  const expired = remainingSec === 0;
  const warning = !expired && remainingSec <= 5 * 60; // last 5 minutes

  const cls = expired
    ? "text-danger font-mono tabular-nums"
    : warning
      ? "text-warn font-mono tabular-nums font-semibold"
      : "text-muted font-mono tabular-nums";

  return (
    <span className={`${cls} ${className}`}>
      {expired ? "Time's up" : `⏱ ${format(remainingSec)}`}
    </span>
  );
}
