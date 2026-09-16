import type { TabItem } from "@/components/TabNav";

/**
 * The GM dashboard's tab set, in one place so every GM page renders the
 * same nav. `pendingCount` drives the Review badge — pass it where the
 * page already knows it (0 / omitted hides the badge).
 */
export function gmTabs(gameId: string, pendingCount = 0): TabItem[] {
  return [
    { label: "Setup", href: `/games/${gameId}` },
    {
      label: "Review",
      href: `/games/${gameId}/review`,
      badge: pendingCount,
      badgeTone: "warn",
    },
    { label: "Leaderboard", href: `/games/${gameId}/leaderboard` },
    { label: "Progress", href: `/games/${gameId}/progress` },
    { label: "Settings", href: `/games/${gameId}/settings` },
  ];
}
