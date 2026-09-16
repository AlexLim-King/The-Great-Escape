import { createClient } from "@/lib/supabase/server";
import MatrixRain from "@/components/MatrixRain";
import TreasureBackdrop from "@/components/TreasureBackdrop";

// Themes that get a custom data-theme wrapper + (optionally) a decorative
// backdrop. Anything else renders the default (Editorial) surface.
const THEMED = ["matrix", "treasure"] as const;
type Theme = (typeof THEMED)[number];

/**
 * Applies the game's chosen theme to the whole player surface
 * (/play/[code]/*). Server-rendered, so the theme is in the initial HTML —
 * no flash. data-theme on the wrapper re-defines the CSS-variable tokens
 * for everything inside; navigating away unmounts it, reverting to default.
 */
export default async function PlayGameLayout(
  props: LayoutProps<"/play/[code]">,
) {
  const { code } = await props.params;

  const supabase = await createClient();
  const { data: game } = await supabase
    .from("games")
    .select("theme")
    .eq("join_code", code.toUpperCase())
    .maybeSingle();

  const theme = THEMED.includes(game?.theme as Theme)
    ? (game!.theme as Theme)
    : null;

  if (!theme) return <>{props.children}</>;

  return (
    <div
      data-theme={theme}
      className="relative flex-1 flex flex-col bg-bg text-text"
    >
      {theme === "matrix" && <MatrixRain />}
      {theme === "treasure" && <TreasureBackdrop />}
      <div className="relative z-10 flex-1 flex flex-col">{props.children}</div>
    </div>
  );
}
