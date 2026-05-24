import { test, expect } from "@playwright/test";
import {
  createGame,
  createTextMission,
  signup,
  uniqueEmail,
} from "./helpers";

/**
 * GM happy path: sign up → create a game (auto-seeded with Team 1–4) →
 * author a mission. Covers the default-teams feature and the core
 * authoring flow.
 */
test("GM can sign up, create a game with default teams, and add a mission", async ({
  page,
}) => {
  await signup(page, { email: uniqueEmail("gm"), name: "Test GM" });

  const { gameId } = await createGame(page, "E2E Test Game");

  // Default teams 1–4 should be present on the Setup page.
  for (const name of ["Team 1", "Team 2", "Team 3", "Team 4"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  await createTextMission(page, gameId, {
    title: "Find the hidden key",
    answer: "skeleton",
    points: 20,
  });

  // Mission is listed back on Setup.
  await expect(page.getByText("Find the hidden key")).toBeVisible();
});
