import { test, expect } from "@playwright/test";

/**
 * Smoke tests — every public page renders its key landmark. Fast sanity
 * check that the server, routing, and CSS are all alive.
 */
test.describe("smoke", () => {
  test("home page renders hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Run unforgettable/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /get started/i }),
    ).toBeVisible();
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create account/i }),
    ).toBeVisible();
    await expect(page.locator('input[name="display_name"]')).toBeVisible();
  });

  test("play page renders join form", async ({ page }) => {
    await page.goto("/play");
    await expect(
      page.getByRole("heading", { name: /join a game/i }),
    ).toBeVisible();
    await expect(page.locator('input[name="join_code"]')).toBeVisible();
  });
});
