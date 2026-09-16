import { test, expect, type Page } from "@playwright/test";
import {
  createGame,
  joinAsGuest,
  pickTeam,
  signup,
  startGame,
  uniqueEmail,
} from "./helpers";

// Minimal valid 1x1 PNG used as the fake photo upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Create a GM-judged photo mission (picking "photo" forces GM-judged). */
async function createPhotoMission(
  page: Page,
  gameId: string,
  title: string,
): Promise<void> {
  await page.goto(`/games/${gameId}/missions/new`);
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="submission_type"]').selectOption("photo");
  await page.getByRole("button", { name: /create mission/i }).click();
  await page.waitForURL(new RegExp(`/games/${gameId}$`));
  await expect(page.getByText(title)).toBeVisible();
}

/**
 * End-of-game media export: players submit photos, and the GM downloads a
 * single ZIP of every photo/video, foldered per team with files named
 * "<Team> - <Mission>.ext". This is the "compiled captured moments" the
 * client wants.
 */
test("GM downloads all player media as a per-team ZIP", async ({ browser }) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Media GM" });
    const { gameId, joinCode } = await createGame(gm, "Beach Hunt");
    await createPhotoMission(gm, gameId, "Beach Selfie");
    await startGame(gm, gameId);

    // A player joins Team 1 and submits a photo.
    await joinAsGuest(player, { name: "Jack", joinCode });
    await pickTeam(player, "Team 1");
    await player.locator("a", { hasText: "Beach Selfie" }).click();
    await player.waitForURL(/\/play\/.+\/m\/.+/);
    await player
      .locator('input[name="media"]')
      .setInputFiles([
        { name: "selfie.png", mimeType: "image/png", buffer: PNG },
      ]);
    await player.getByRole("button", { name: /submit photo/i }).click();
    await player.waitForURL(new RegExp(`/play/${joinCode}$`, "i"));

    // The Review page surfaces a gated "Download media" link.
    await gm.goto(`/games/${gameId}/review`);
    await expect(
      gm.getByRole("link", { name: /download media/i }),
    ).toBeVisible();

    // Fetch the ZIP via the GM's authenticated context and inspect it. We
    // use store (no compression), so entry paths appear verbatim in the
    // bytes — enough to assert the folder/file naming without a zip parser.
    const res = await gm.request.get(`/games/${gameId}/export?type=media`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("zip");
    const buf = await res.body();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // ZIP signature
    expect(buf.toString("latin1")).toContain(
      "Team 1/Team 1 - Beach Selfie.png",
    );
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});
