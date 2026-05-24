import { test, expect } from "@playwright/test";
import {
  createGame,
  createTextMission,
  joinAsGuest,
  pickTeam,
  signup,
  uniqueEmail,
} from "./helpers";

/**
 * End-to-end across two isolated sessions: a GM hosts a game and a guest
 * player joins. The GM broadcasts an announcement and the player sees it
 * in their notification history. Exercises default teams, mission
 * authoring, guest join, and the GM announcement → player notification
 * pipeline.
 */
test("GM broadcast reaches a joined player's notifications", async ({
  browser,
}) => {
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    // --- GM sets up the game ---------------------------------------------
    await signup(gm, { email: uniqueEmail("gm"), name: "Broadcast GM" });
    const { gameId, joinCode } = await createGame(gm, "Broadcast Game");
    await createTextMission(gm, gameId, {
      title: "Opening mission",
      answer: "go",
    });

    // --- Player joins as a guest and picks a team ------------------------
    await joinAsGuest(player, { name: "Player One", joinCode });
    await pickTeam(player, "Team 1");
    // The all-teams mission is unlocked and visible to the player.
    await expect(player.getByText("Opening mission")).toBeVisible();

    // --- GM broadcasts an announcement -----------------------------------
    const announcement = `Heads up ${Date.now()}`;
    await gm.goto(`/games/${gameId}/review`);
    await gm.getByRole("button", { name: /compose/i }).click();
    await gm.locator('input[name="title"]').fill(announcement);
    await gm
      .locator('textarea[name="body"]')
      .fill("Five minutes left on the clock.");
    await gm.getByRole("button", { name: /send announcement/i }).click();

    // GM sees the sent confirmation (scope to the banner — the wording
    // also appears in the "Recent announcements" history row below).
    await expect(gm.locator(".banner-success")).toContainText(
      /sent to 1 player/i,
    );

    // --- Player sees it in their notifications ---------------------------
    await player.goto(`/play/${joinCode}/notifications`);
    await expect(player.getByText(announcement)).toBeVisible();
    await expect(
      player.getByText(/five minutes left on the clock/i),
    ).toBeVisible();
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
