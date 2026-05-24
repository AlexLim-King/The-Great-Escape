"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  team_id: string;
  team_name: string;
  color: string;
  score: number;
  completed: number;
};

export default function Leaderboard({
  gameId,
  highlightTeamId,
}: {
  gameId: string;
  /** Optional team to bold/highlight in the list (the player's own team). */
  highlightTeamId?: string | null;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const refetch = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc("game_leaderboard", {
      p_game_id: gameId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, [supabase, gameId]);

  useEffect(() => {
    void refetch();

    // Listen for any change to team_mission_state in this game's teams.
    // Refetch the (authorized, aggregate) leaderboard via RPC on every event.
    const channel = supabase
      .channel(`leaderboard:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_mission_state",
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, gameId, refetch]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold tracking-tight">Leaderboard</h2>
        {rows && rows.length > 0 && (
          <span className="text-xs text-muted">
            {rows.length} {rows.length === 1 ? "team" : "teams"} · live
          </span>
        )}
      </div>

      {error && <p className="banner banner-error mb-2">{error}</p>}

      {!rows ? (
        <p className="text-sm text-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No teams yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isMe = highlightTeamId === r.team_id;
            const isFirst = i === 0;
            const isPodium = i < 3;
            const medal = ["🥇", "🥈", "🥉"][i];
            return (
              <li
                key={r.team_id}
                className={`card card-compact flex items-center gap-3 transition-all ${
                  isFirst ? "!py-4" : ""
                } ${
                  isMe
                    ? "!border-accent ring-2 ring-accent/30"
                    : ""
                }`}
                style={
                  isFirst
                    ? {
                        boxShadow:
                          "var(--shadow), 0 0 0 1px color-mix(in oklab, var(--color-accent) 30%, transparent)",
                      }
                    : undefined
                }
              >
                <span
                  className={`text-center font-mono ${
                    isPodium ? "text-2xl w-9" : "text-sm text-subtle w-9"
                  }`}
                  aria-hidden
                >
                  {isPodium ? medal : i + 1}
                </span>
                <span
                  className="inline-block w-3 h-3 rounded-full ring-2 ring-[var(--color-border)]"
                  style={{ background: r.color }}
                  aria-hidden
                />
                <span
                  className={`flex-1 ${
                    isFirst ? "text-lg font-semibold" : isMe ? "font-semibold" : ""
                  }`}
                >
                  {r.team_name}
                  {isMe && (
                    <span className="ml-2 pill pill-accent">you</span>
                  )}
                </span>
                <span className="text-xs text-muted hidden sm:inline">
                  {r.completed} done
                </span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    isFirst ? "text-xl" : "text-sm"
                  }`}
                >
                  {r.score}
                  <span className="text-subtle font-normal ml-0.5 text-xs">
                    pts
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
