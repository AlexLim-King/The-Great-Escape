import { test, expect } from "@playwright/test";
import { createGame, joinAsGuest, signup, uniqueEmail } from "./helpers";

/**
 * Per-game theming: the GM picks the Matrix theme in settings, and a player
 * who joins sees the player surface rendered in that theme (green CLI look +
 * digital-rain canvas).
 */
test("GM sets the Matrix theme and players see it on join", async ({
  browser,
}) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Theme GM" });
    const { gameId, joinCode } = await createGame(gm, "Matrix Game");

    // Pick the Matrix theme in game settings.
    await gm.goto(`/games/${gameId}/settings`);
    await gm.locator('select[name="theme"]').selectOption("matrix");
    await gm.getByRole("button", { name: /save settings/i }).click();
    await expect(gm.locator('select[name="theme"]')).toHaveValue("matrix");

    // A joining player gets the themed surface.
    await joinAsGuest(player, { name: "Neo", joinCode });
    await expect(player.locator('[data-theme="matrix"]')).toBeVisible();
    await expect(player.locator("canvas")).toBeVisible();
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});

/**
 * The pirate/beach "Treasure Hunt" theme: GM selects it, a joining player
 * sees the themed surface plus the decorative wave backdrop.
 */
test("GM sets the Treasure Hunt theme and players see it on join", async ({
  browser,
}) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Treasure GM" });
    const { gameId, joinCode } = await createGame(gm, "Treasure Game");

    await gm.goto(`/games/${gameId}/settings`);
    await gm.locator('select[name="theme"]').selectOption("treasure");
    await gm.getByRole("button", { name: /save settings/i }).click();
    await expect(gm.locator('select[name="theme"]')).toHaveValue("treasure");

    await joinAsGuest(player, { name: "Long John", joinCode });
    await expect(player.locator('[data-theme="treasure"]')).toBeVisible();
    await expect(player.locator(".treasure-backdrop")).toBeAttached();
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});
