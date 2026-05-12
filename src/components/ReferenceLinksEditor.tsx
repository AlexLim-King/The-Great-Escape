"use client";

import { useState } from "react";

export type ReferenceLink = { label: string; url: string };

/**
 * Repeating-row editor for mission reference links. Each row is a
 * (label, url) pair. Serialized to a single JSON hidden input so the
 * server action can parse the array in one shot.
 */
export default function ReferenceLinksEditor({
  initial,
  name = "reference_links",
}: {
  initial?: ReferenceLink[];
  name?: string;
}) {
  const [links, setLinks] = useState<ReferenceLink[]>(initial ?? []);

  function update(idx: number, patch: Partial<ReferenceLink>) {
    setLinks((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function add() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function remove(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <fieldset className="border border-black/10 dark:border-white/10 rounded p-3 space-y-2">
      <legend className="text-sm px-1">Reference links (optional)</legend>

      <input type="hidden" name={name} value={JSON.stringify(links)} />

      {links.length === 0 ? (
        <p className="text-xs text-black/55 dark:text-white/55">
          Attach external URLs (a map, a clip, supporting docs) that players
          should see on the mission detail page.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((l, idx) => (
            <li key={idx} className="flex flex-wrap gap-2 items-start">
              <input
                placeholder="Label (e.g. Map)"
                value={l.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                className="w-32 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
              />
              <input
                type="url"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => update(idx, { url: e.target.value })}
                className="flex-1 min-w-[12rem] rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-xs text-red-600 hover:underline px-1 py-1.5"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        className="text-xs rounded border border-black/15 dark:border-white/15 px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
      >
        + Add link
      </button>
    </fieldset>
  );
}
