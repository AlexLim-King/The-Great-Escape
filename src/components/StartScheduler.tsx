"use client";

import { useState } from "react";
import { scheduleGameStart } from "@/lib/gm-actions";

/**
 * Schedule a game start two ways: a relative duration ("in 30 minutes") or
 * an absolute wall-clock time ("at 2026-05-24 14:00"). A radio toggles
 * which input is shown; only that input is in the DOM, so the server action
 * receives exactly one mode's fields.
 */
export default function StartScheduler({ gameId }: { gameId: string }) {
  const [mode, setMode] = useState<"relative" | "absolute">("relative");

  return (
    <form action={scheduleGameStart} className="space-y-2">
      <input type="hidden" name="game_id" value={gameId} />

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="__mode"
            checked={mode === "relative"}
            onChange={() => setMode("relative")}
          />
          In a bit
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="__mode"
            checked={mode === "absolute"}
            onChange={() => setMode("absolute")}
          />
          At a set time
        </label>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        {mode === "relative" ? (
          <>
            <input
              name="amount"
              type="number"
              min={1}
              defaultValue={30}
              required
              className="input w-20 px-2 py-1.5 text-sm"
            />
            <select
              name="unit"
              defaultValue="minutes"
              className="select w-28 px-2 py-1.5 text-sm"
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </>
        ) : (
          <input
            name="starts_at"
            type="datetime-local"
            required
            className="input w-auto px-2 py-1.5 text-sm"
          />
        )}
        <button type="submit" className="btn btn-secondary btn-sm">
          Schedule
        </button>
      </div>
    </form>
  );
}
