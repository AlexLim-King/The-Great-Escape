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
      <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mb-2">
          {error}
        </p>
      )}

      {!rows ? (
        <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No teams yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => {
            const isMe = highlightTeamId === r.team_id;
            return (
              <li
                key={r.team_id}
                className={`rounded border border-black/10 dark:border-white/10 px-3 py-2 flex items-center gap-3 ${
                  isMe ? "ring-2 ring-blue-500/50" : ""
                }`}
              >
                <span className="font-mono text-sm text-black/50 dark:text-white/50 w-5 text-right">
                  {i + 1}
                </span>
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: r.color }}
                  aria-hidden
                />
                <span className={`flex-1 ${isMe ? "font-semibold" : ""}`}>
                  {r.team_name}
                </span>
                <span className="text-xs text-black/60 dark:text-white/60">
                  {r.completed} done
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {r.score} pts
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
