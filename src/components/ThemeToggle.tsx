"use client";

import { useEffect, useState } from "react";

// Light / Dark / System color scheme, persisted in localStorage under
// "theme-pref" and applied as data-color-scheme on <html>. The matching
// pre-paint script in layout.tsx reads the same key to avoid a flash; this
// component just lets the user change it. Default is light.
type Pref = "light" | "dark" | "system";

const ORDER: Pref[] = ["light", "dark", "system"];
const META: Record<Pref, { icon: string; label: string }> = {
  light: { icon: "☀", label: "Light" },
  dark: { icon: "☾", label: "Dark" },
  system: { icon: "🖥", label: "System" },
};

function isPref(v: string | null): v is Pref {
  return v === "light" || v === "dark" || v === "system";
}

/** Read the stored preference (default light). Safe during SSR. */
function initialPref(): Pref {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme-pref");
  return isPref(stored) ? stored : "light";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyPref(pref: Pref): void {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.dataset.colorScheme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle() {
  // Lazy init reads localStorage on the client's first render (server uses
  // "light"); the button's text is suppressHydrationWarning'd so the
  // server/client difference doesn't warn.
  const [pref, setPref] = useState<Pref>(initialPref);

  // Apply on change (a DOM side effect — not state), and in "system" mode
  // follow live OS changes.
  useEffect(() => {
    applyPref(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPref("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    localStorage.setItem("theme-pref", next);
    setPref(next);
  }

  const m = META[pref];

  return (
    <button
      type="button"
      onClick={cycle}
      className="btn btn-ghost btn-sm"
      aria-label={`Theme: ${m.label}. Click to switch (Light, Dark, System).`}
      title="Switch theme — Light / Dark / System"
      suppressHydrationWarning
    >
      <span aria-hidden suppressHydrationWarning>
        {m.icon}
      </span>
      <span className="hidden sm:inline ml-1" suppressHydrationWarning>
        {m.label}
      </span>
    </button>
  );
}
