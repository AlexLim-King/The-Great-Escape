import Link from "next/link";

export type TabItem = {
  /** Visible label and the value matched against `current`. */
  label: string;
  href: string;
  /** Optional count badge (e.g. pending review queue). Omit / 0 hides it. */
  badge?: number;
  /** Optional badge styling — defaults to neutral; pass "warn" for amber. */
  badgeTone?: "neutral" | "warn";
};

export default function TabNav({
  tabs,
  current,
}: {
  tabs: TabItem[];
  /** Matches a tab's `label`. */
  current: string;
}) {
  return (
    <nav className="flex gap-1 border-b border-black/10 dark:border-white/10 -mx-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = current === t.label;
        const showBadge = typeof t.badge === "number" && t.badge > 0;
        const badgeCls =
          t.badgeTone === "warn"
            ? isActive
              ? "bg-amber-500/30 text-amber-700 dark:text-amber-200"
              : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
            : isActive
              ? "bg-foreground/15"
              : "bg-black/10 dark:bg-white/10";
        return (
          <Link
            key={t.label}
            href={t.href}
            className={`px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive
                ? "border-foreground font-medium"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-foreground"
            }`}
          >
            {t.label}
            {showBadge && (
              <span
                className={`ml-2 inline-flex items-center justify-center rounded-full text-xs px-2 min-w-5 h-5 ${badgeCls}`}
              >
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
