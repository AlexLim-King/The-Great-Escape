import { test, expect } from "@playwright/test";
import { createGame, signup, uniqueEmail } from "./helpers";

// Minimal valid 1x1 PNG, reused for every fake upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Batch mission upload: pick a set of images → titles are derived from the
 * file names → create them in one shot → they appear on Setup as missions
 * with the pictures attached.
 */
test("GM batch-creates missions from a set of images", async ({ page }) => {
  await signup(page, { email: uniqueEmail("gm"), name: "Batch GM" });
  const { gameId } = await createGame(page, "Batch Game");

  await page.goto(`/games/${gameId}/missions/batch`);
  // Wait until the page is compiled + interactive before touching inputs.
  await expect(
    page.getByRole("button", { name: /select images/i }),
  ).toBeVisible();

  // Pick a first set of two images.
  await page
    .getByTestId("batch-files-input")
    .setInputFiles([
      { name: "ancient-temple.png", mimeType: "image/png", buffer: PNG },
      { name: "hidden_cave.png", mimeType: "image/png", buffer: PNG },
    ]);
  await expect(
    page.getByRole("textbox", { name: /mission title/i }),
  ).toHaveCount(2);

  // Selections are additive — picking more adds to the set rather than
  // replacing it.
  await page
    .getByTestId("batch-files-input")
    .setInputFiles([
      { name: "rooftop-view.png", mimeType: "image/png", buffer: PNG },
    ]);
  await expect(
    page.getByRole("textbox", { name: /mission title/i }),
  ).toHaveCount(3);

  // Titles are derived from the file names.
  await expect(page.locator('input[value="Ancient Temple"]')).toBeVisible();
  await expect(page.locator('input[value="Hidden Cave"]')).toBeVisible();
  await expect(page.locator('input[value="Rooftop View"]')).toBeVisible();

  // Create them, then land back on Setup with all three missions listed.
  await page.getByRole("button", { name: /create 3 missions/i }).click();
  await page.waitForURL(new RegExp(`/games/${gameId}$`));
  await expect(page.getByText("Ancient Temple")).toBeVisible();
  await expect(page.getByText("Hidden Cave")).toBeVisible();
  await expect(page.getByText("Rooftop View")).toBeVisible();
});
