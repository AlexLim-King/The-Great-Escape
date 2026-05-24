import { createClient } from "@/lib/supabase/server";
import MatrixRain from "@/components/MatrixRain";

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

  const theme = game?.theme === "matrix" ? "matrix" : null;

  if (!theme) return <>{props.children}</>;

  return (
    <div
      data-theme={theme}
      className="relative flex-1 flex flex-col bg-bg text-text"
    >
      <MatrixRain />
      <div className="relative z-10 flex-1 flex flex-col">{props.children}</div>
    </div>
  );
}
