import { test, expect } from "@playwright/test";
import { createGame, joinAsGuest, signup, uniqueEmail } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Game intro details: the GM sets a location and a cover image in settings,
 * and a joining player sees them on the join/intro screen.
 */
test("GM sets cover image + location; players see them on join", async ({
  browser,
}) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Intro GM" });
    const { gameId, joinCode } = await createGame(gm, "Intro Game");

    await gm.goto(`/games/${gameId}/settings`);

    // Location via the details form.
    await gm
      .locator('input[name="location"]')
      .fill("Jonker Street, Melaka");
    await gm.getByRole("button", { name: /save settings/i }).click();
    await expect(gm.locator('input[name="location"]')).toHaveValue(
      "Jonker Street, Melaka",
    );

    // Cover image upload.
    await gm
      .locator('input[name="image"]')
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await gm.getByRole("button", { name: /^(upload|replace)$/i }).click();
    await expect(
      gm.getByRole("button", { name: /remove image/i }),
    ).toBeVisible();

    // Player join sees the intro.
    await joinAsGuest(player, { name: "Player One", joinCode });
    await expect(
      player.getByText(/Jonker Street, Melaka/),
    ).toBeVisible();
    await expect(player.locator("main img")).toBeVisible();
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});
