"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Compact one-line summary of a DNF unlock spec.
 *
 *   [["A"]]                -> "A"
 *   [["A","B"]]            -> "A + B"
 *   [["A"],["B"]]          -> "A or B"
 *   [["A","B"],["C","D"]]  -> "A + B or C + D"
 *
 * Long titles get rendered as-is — the full picture is in the popup.
 */
function summarizeUnlockGroups(
  groups: string[][],
  titleById: Record<string, string>,
): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => g.map((id) => titleById[id] ?? "?").join(" + "))
    .join(" or ");
}

export type SortableMission = {
  id: string;
  title: string;
  description: string | null;
  points: number;
  submission_type: "text" | "photo" | "video";
  validation_mode: "auto" | "gm_judged";
  /** DNF unlock spec — list of AND groups; ANY group satisfies. */
  unlock_groups: string[][];
  /** Optional time gate — mission stays locked until this time. */
  unlock_after: string | null;
  deadline_mode:
    | "absolute"
    | "relative_to_unlock"
    | "relative_to_game_start"
    | null;
  deadline_at: string | null;
  deadline_duration_sec: number | null;
  assignment_mode: "all" | "specific";
  /** Length of mission_team_assignments for the "specific" badge. */
  assignment_count: number;
  /** Reference image signed URL, if any. */
  reference_url: string | null;
};

type Props = {
  gameId: string;
  initial: SortableMission[];
  /** id → title for prerequisite lookup. */
  missionTitleById: Record<string, string>;
  /** Server actions, passed in so the page can stay server-rendered. */
  reorderMissions: (gameId: string, ids: string[]) => Promise<void>;
  deleteMission: (formData: FormData) => void | Promise<void>;
};

export default function SortableMissionList({
  gameId,
  initial,
  missionTitleById,
  reorderMissions,
  deleteMission,
}: Props) {
  const [items, setItems] = useState(initial);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const sensors = useSensors(
    // 6px tolerance so a Click-to-Edit on the row never registers as a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = items.findIndex((m) => m.id === active.id);
    const newIdx = items.findIndex((m) => m.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const next = arrayMove(items, oldIdx, newIdx);
    const previous = items;
    setItems(next); // optimistic
    setPendingError(null);

    void reorderMissions(
      gameId,
      next.map((m) => m.id),
    ).catch((err) => {
      // Roll back on error
      setItems(previous);
      setPendingError(err?.message ?? "Couldn't save the new order.");
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No missions yet.
      </p>
    );
  }

  return (
    <>
      {pendingError && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2 mb-2">
          {pendingError}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((m) => (
              <SortableMissionRow
                key={m.id}
                mission={m}
                gameId={gameId}
                missionTitleById={missionTitleById}
                deleteMission={deleteMission}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableMissionRow({
  mission: m,
  gameId,
  missionTitleById,
  deleteMission,
}: {
  mission: SortableMission;
  gameId: string;
  missionTitleById: Record<string, string>;
  deleteMission: (formData: FormData) => void | Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded border border-black/10 dark:border-white/10 p-3 bg-background ${
        isDragging ? "shadow-lg" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle — only this gets the drag listeners so the rest
            of the row stays interactive (Edit link, Delete button). */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${m.title}`}
          title="Drag to reorder"
          className="cursor-grab active:cursor-grabbing touch-none flex-none mt-0.5 px-1 py-0.5 rounded text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <svg
            width="14"
            height="20"
            viewBox="0 0 14 20"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="3" cy="4" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="3" cy="16" r="1.5" />
            <circle cx="11" cy="4" r="1.5" />
            <circle cx="11" cy="10" r="1.5" />
            <circle cx="11" cy="16" r="1.5" />
          </svg>
        </button>

        {m.reference_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={m.reference_url}
            alt=""
            className="w-16 h-16 object-cover rounded border border-black/10 dark:border-white/10 flex-none"
          />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium">{m.title}</p>
          <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
            {m.submission_type} · {m.validation_mode} · {m.points} pts
            {" · "}
            <span className="text-blue-700 dark:text-blue-300">
              {m.assignment_mode === "all"
                ? "all teams"
                : `${m.assignment_count} team${m.assignment_count === 1 ? "" : "s"}`}
            </span>
            {m.unlock_groups.length > 0 && (
              <>
                {" "}
                · requires{" "}
                <span className="italic">
                  {summarizeUnlockGroups(m.unlock_groups, missionTitleById)}
                </span>
              </>
            )}
            {m.unlock_after && (
              <>
                {" "}·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  not before {new Date(m.unlock_after).toLocaleString()}
                </span>
              </>
            )}
            {m.deadline_mode && (
              <>
                {" "}
                ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  {m.deadline_mode === "absolute"
                    ? `until ${
                        m.deadline_at
                          ? new Date(m.deadline_at).toLocaleString()
                          : "?"
                      }`
                    : m.deadline_mode === "relative_to_unlock"
                      ? `${Math.round((m.deadline_duration_sec ?? 0) / 60)} min after unlock`
                      : `${Math.round((m.deadline_duration_sec ?? 0) / 60)} min from start`}
                </span>
              </>
            )}
          </p>
          {m.description && <p className="text-sm mt-1">{m.description}</p>}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <Link
            href={`/games/${gameId}/missions/${m.id}/edit`}
            className="text-sm hover:underline"
          >
            Edit
          </Link>
          <form action={deleteMission}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="game_id" value={gameId} />
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
