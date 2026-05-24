import { test, expect } from "@playwright/test";
import {
  createGame,
  createJudgedTextMission,
  joinAsGuest,
  pickTeam,
  signup,
  startGame,
  submitTextMission,
  uniqueEmail,
} from "./helpers";

/**
 * Game lifecycle: pausing a game closes player submissions (banner + the
 * submit page redirects back), and resuming reopens them.
 */
test("GM can pause and resume, gating player submissions", async ({
  browser,
}) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Lifecycle GM" });
    const { gameId, joinCode } = await createGame(gm, "Lifecycle Game");
    const missionTitle = "Submit something";
    await createJudgedTextMission(gm, gameId, { title: missionTitle });
    await startGame(gm, gameId);

    await joinAsGuest(player, { name: "Player One", joinCode });
    await pickTeam(player, "Team 1");

    // Pause the game from settings.
    await gm.goto(`/games/${gameId}/settings`);
    await gm.getByRole("button", { name: /^pause$/i }).click();
    await expect(gm.locator(".pill", { hasText: /paused/i })).toBeVisible();

    // Player sees the paused banner and can't open the submit page.
    await player.goto(`/play/${joinCode}`);
    await expect(player.getByText(/game is paused/i)).toBeVisible();
    await player.locator("a", { hasText: missionTitle }).click();
    await expect(player).toHaveURL(new RegExp(`/play/${joinCode}\\?`, "i"));
    await expect(player.locator(".banner-error")).toContainText(/paused/i);

    // Resume → submissions work again.
    await gm.goto(`/games/${gameId}/settings`);
    await gm.getByRole("button", { name: /resume/i }).click();
    await expect(gm.locator(".pill", { hasText: /active/i })).toBeVisible();

    await submitTextMission(player, joinCode, {
      title: missionTitle,
      answer: "done",
    });
    await expect(player.getByText(/submitted/i)).toBeVisible();
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});

/**
 * Relative scheduling: "start in N hours" puts the game in a scheduled
 * state — players see a countdown and can't submit until it goes live.
 */
test("GM can schedule a start; players see a countdown", async ({
  browser,
}) => {
  const gmCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Schedule GM" });
    const { gameId, joinCode } = await createGame(gm, "Scheduled Game");

    // Schedule the start two hours out.
    await gm.goto(`/games/${gameId}/settings`);
    await gm.locator('input[name="amount"]').fill("2");
    await gm.locator('select[name="unit"]').selectOption("hours");
    await gm.getByRole("button", { name: /^schedule$/i }).click();
    // Settings now shows the scheduled start + a Cancel option.
    await expect(
      gm.getByRole("button", { name: /cancel schedule/i }),
    ).toBeVisible();

    // Player joins and sees the "starts in" countdown banner.
    await joinAsGuest(player, { name: "Player One", joinCode });
    await pickTeam(player, "Team 1");
    await expect(player.getByText(/game starts in/i)).toBeVisible();
  } finally {
    await gmCtx.close();
    await playerCtx.close();
  }
});

/**
 * Absolute scheduling: the GM can also pick a specific wall-clock start
 * time (the "At a set time" mode), not just a relative duration.
 */
test("GM can schedule a start at a specific time", async ({ page }) => {
  await signup(page, { email: uniqueEmail("gm"), name: "Absolute GM" });
  const { gameId } = await createGame(page, "Absolute Game");

  await page.goto(`/games/${gameId}/settings`);
  await page.getByRole("radio", { name: /at a set time/i }).check();

  // Pick a time two hours out, formatted for the datetime-local input.
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(
    future.getDate(),
  )}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
  await page.locator('input[name="starts_at"]').fill(dt);
  await page.getByRole("button", { name: /^schedule$/i }).click();

  // Game is now scheduled (Cancel schedule appears).
  await expect(
    page.getByRole("button", { name: /cancel schedule/i }),
  ).toBeVisible();
});
