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
    <nav className="flex gap-1 border-b border-default -mx-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = current === t.label;
        const showBadge = typeof t.badge === "number" && t.badge > 0;
        const badgeCls =
          t.badgeTone === "warn" ? "pill pill-warn" : "pill pill-neutral";
        return (
          <Link
            key={t.label}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive
                ? "border-accent text-text font-medium"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
            {showBadge && (
              <span className={`ml-2 ${badgeCls}`}>{t.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
