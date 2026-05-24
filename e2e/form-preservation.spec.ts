import { test, expect } from "@playwright/test";
import { createGame, signup, uniqueEmail } from "./helpers";

/**
 * These tests lock in the "forms keep your input on error" behavior so it
 * can't silently regress (see the Conventions section in AGENTS.md).
 */
test.describe("form input preservation on error", () => {
  test("login keeps the email after a bad password", async ({ page }) => {
    await page.goto("/login");
    const email = "someone@example.com";
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("wrong-password");
    await page.getByRole("button", { name: /^log in$/i }).click();

    // Error banner appears...
    await expect(page.locator(".banner-error")).toBeVisible();
    // ...and the email field still holds what we typed.
    await expect(page.locator('input[name="email"]')).toHaveValue(email);
  });

  test("mission form requires an answer and keeps the title", async ({
    page,
  }) => {
    await signup(page, { email: uniqueEmail("gm"), name: "Form GM" });
    const { gameId } = await createGame(page, "Form Game");

    await page.goto(`/games/${gameId}/missions/new`);
    const title = "Answerless mission";
    await page.locator('input[name="title"]').fill(title);
    // Leave the (required) expected answer blank, then try to submit.
    await page.locator('input[name="expected_answer"]').fill("");
    await page.getByRole("button", { name: /create mission/i }).click();

    // Native required validation blocks the submit: we stay on the form
    // and nothing the user typed is lost.
    await expect(page).toHaveURL(new RegExp(`/games/${gameId}/missions/new`));
    await expect(page.locator('input[name="title"]')).toHaveValue(title);
  });

  test("specific-teams with none selected disables submit", async ({
    page,
  }) => {
    await signup(page, { email: uniqueEmail("gm"), name: "Assign GM" });
    const { gameId } = await createGame(page, "Assign Game");

    await page.goto(`/games/${gameId}/missions/new`);
    await page.locator('input[name="title"]').fill("Team-specific mission");
    await page.locator('input[name="expected_answer"]').fill("answer");

    // Switch assignment to "Specific teams" but check none.
    await page.getByText("Specific teams", { exact: true }).click();

    await expect(
      page.getByText(/pick at least one team/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create mission/i }),
    ).toBeDisabled();
  });
});
