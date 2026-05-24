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
 * The mission-centric review flow: a GM authors a judged mission, a player
 * submits to it, then the GM reviews via the "By Mission" gallery → opens
 * the per-mission comparison page → judges the submission there. Exercises
 * the gallery, the requirements panel, and the redirect-back-to-detail
 * behavior of the judging actions.
 */
test("GM reviews and approves a submission from the mission gallery", async ({
  browser,
}) => {
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    // GM hosts a game with a GM-judged mission.
    await signup(gm, { email: uniqueEmail("gm"), name: "Review GM" });
    const { gameId, joinCode } = await createGame(gm, "Review Game");
    const missionTitle = "Photograph the lobby";
    await createJudgedTextMission(gm, gameId, { title: missionTitle });
    await startGame(gm, gameId);

    // Player joins and submits to the mission.
    await joinAsGuest(player, { name: "Player One", joinCode });
    await pickTeam(player, "Team 1");
    await submitTextMission(player, joinCode, {
      title: missionTitle,
      answer: "We are in the lobby!",
    });

    // GM opens the review gallery (By Mission is the default view).
    await gm.goto(`/games/${gameId}/review`);
    await expect(
      gm.getByRole("link", { name: /by mission/i }),
    ).toBeVisible();

    // The mission card shows a pending count and links into the detail page.
    const card = gm.locator("li", { hasText: missionTitle });
    await expect(card.getByText(/1 to review/i)).toBeVisible();
    await card.getByRole("link").first().click();

    // Per-mission page: requirements pinned above, the team's submission below.
    await gm.waitForURL(new RegExp(`/games/${gameId}/review/m/`));
    await expect(gm.getByText(/requirements/i).first()).toBeVisible();
    await expect(gm.getByText("Team 1")).toBeVisible();
    await expect(gm.getByText("We are in the lobby!")).toBeVisible();

    // Approve from the comparison view; we should stay on the detail page
    // and the submission flips to Approved.
    await gm.getByRole("button", { name: /^approve$/i }).click();
    await gm.waitForURL(new RegExp(`/games/${gameId}/review/m/`));
    await expect(gm.locator(".pill", { hasText: /approved/i })).toBeVisible();
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
