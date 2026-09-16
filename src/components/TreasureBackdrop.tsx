/**
 * Decorative backdrop for the "treasure" player theme: two layered ocean
 * waves drifting along the bottom of the screen. Pure CSS animation (no
 * canvas / JS), fixed full-screen behind the content (z-0), pointer-events
 * none. The wave shapes + motion live in globals.css (.treasure-waves*).
 */
export default function TreasureBackdrop() {
  return (
    <div aria-hidden className="treasure-backdrop">
      <div className="treasure-waves treasure-waves-back" />
      <div className="treasure-waves treasure-waves-front" />
    </div>
  );
}
