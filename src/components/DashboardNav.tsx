import Link from "next/link";

type Tab = "setup" | "review";

export default function DashboardNav({
  gameId,
  current,
  pendingCount,
}: {
  gameId: string;
  current: Tab;
  /** Optional badge shown next to "Review". Omit to hide it. */
  pendingCount?: number;
}) {
  const tabs: Array<{
    value: Tab;
    label: string;
    href: string;
    badge?: number;
  }> = [
    { value: "setup", label: "Setup", href: `/games/${gameId}` },
    {
      value: "review",
      label: "Review",
      href: `/games/${gameId}/review`,
      badge: pendingCount,
    },
  ];

  return (
    <nav className="flex gap-1 border-b border-black/10 dark:border-white/10 -mx-1">
      {tabs.map((t) => {
        const isActive = current === t.value;
        return (
          <Link
            key={t.value}
            href={t.href}
            className={`px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive
                ? "border-foreground font-medium"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-foreground"
            }`}
          >
            {t.label}
            {typeof t.badge === "number" && t.badge > 0 && (
              <span
                className={`ml-2 inline-flex items-center justify-center rounded-full text-xs px-2 min-w-5 h-5 ${
                  isActive
                    ? "bg-amber-500/30 text-amber-700 dark:text-amber-200"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                }`}
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
