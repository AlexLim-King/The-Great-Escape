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
 * The GM management cluster: the per-team progress map, the team filter on
 * the review queue, and CSV export. One GM hosts a judged mission, one
 * player (Team 1) submits, then we exercise all three surfaces from the GM
 * side.
 */
test("GM progress map, review team filter, and CSV export", async ({
  browser,
}) => {
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    await signup(gm, { email: uniqueEmail("gm"), name: "Mgmt GM" });
    const { gameId, joinCode } = await createGame(gm, "Management Game");
    const missionTitle = "Find the hidden key";
    await createJudgedTextMission(gm, gameId, { title: missionTitle });
    await startGame(gm, gameId);

    await joinAsGuest(player, { name: "Player One", joinCode });
    await pickTeam(player, "Team 1");
    await submitTextMission(player, joinCode, {
      title: missionTitle,
      answer: "It was under the rug!",
    });

    // ── Progress map ────────────────────────────────────────────────────
    await gm.goto(`/games/${gameId}/progress`);
    await expect(
      gm.getByRole("heading", { name: /team progress/i }),
    ).toBeVisible();
    // Team columns + the mission row.
    await expect(
      gm.getByRole("columnheader", { name: /team 1/i }),
    ).toBeVisible();
    await expect(
      gm.getByRole("rowheader", { name: new RegExp(missionTitle, "i") }),
    ).toBeVisible();
    // Team 1's submission puts that cell into "pending review"; teams who
    // haven't submitted an always-available mission are "unlocked".
    await expect(gm.locator('[title="Pending review"]').first()).toBeVisible();
    await expect(gm.locator('[title="Unlocked"]').first()).toBeVisible();

    // ── Review team filter ──────────────────────────────────────────────
    await gm.goto(`/games/${gameId}/review?view=status`);
    await expect(
      gm.getByRole("link", { name: /all teams/i }),
    ).toBeVisible();
    // Filtering to a team with no submissions empties the queue.
    await gm.getByRole("link", { name: /^Team 2$/ }).click();
    await gm.waitForURL(/team=/);
    await expect(
      gm.getByText(/submissions from this team/i),
    ).toBeVisible();
    // Filtering to Team 1 shows their pending submission again.
    await gm.getByRole("link", { name: /^Team 1$/ }).click();
    await expect(gm.getByText("It was under the rug!")).toBeVisible();

    // ── CSV export (uses the GM's authenticated cookie jar) ─────────────
    const subsRes = await gm.request.get(
      `/games/${gameId}/export?type=submissions`,
    );
    expect(subsRes.ok()).toBeTruthy();
    expect(subsRes.headers()["content-type"]).toContain("text/csv");
    const subsCsv = await subsRes.text();
    expect(subsCsv).toContain(missionTitle);
    expect(subsCsv).toContain("Team 1");

    const lbRes = await gm.request.get(
      `/games/${gameId}/export?type=leaderboard`,
    );
    expect(lbRes.ok()).toBeTruthy();
    expect(lbRes.headers()["content-type"]).toContain("text/csv");
    expect(await lbRes.text()).toContain("Team 1");
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
