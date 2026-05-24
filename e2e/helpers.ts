import { expect, type Page } from "@playwright/test";

/** Unique-per-run email so repeated test runs never collide. */
export function uniqueEmail(prefix = "gm"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

export const TEST_PASSWORD = "password123";

/**
 * Sign up a brand-new GM account. Local Supabase auto-confirms (no email
 * step), so we land authenticated on the home page.
 */
export async function signup(
  page: Page,
  opts: { email: string; name: string; password?: string },
): Promise<void> {
  await page.goto("/signup");
  await page.locator('input[name="display_name"]').fill(opts.name);
  await page.locator('input[name="email"]').fill(opts.email);
  await page
    .locator('input[name="password"]')
    .fill(opts.password ?? TEST_PASSWORD);
  await page.getByRole("button", { name: /sign up/i }).click();
  // Signup redirects to "/" and the home page shows the host CTA when authed.
  await expect(
    page.getByRole("link", { name: /host a game/i }),
  ).toBeVisible();
}

/**
 * Create a game and return its id, /games/[id] URL, and join code. Every
 * new game is seeded with Team 1–4, so the Setup page is ready to use.
 */
export async function createGame(
  page: Page,
  name: string,
): Promise<{ gameId: string; gameUrl: string; joinCode: string }> {
  await page.goto("/games/new");
  await page.locator('input[name="name"]').fill(name);
  await page.getByRole("button", { name: /create game/i }).click();

  await page.waitForURL(/\/games\/[0-9a-f-]+$/);
  const gameUrl = new URL(page.url()).pathname;
  const gameId = gameUrl.split("/").pop()!;

  const joinCode = (
    await page.getByTestId("join-code").innerText()
  ).trim();
  expect(joinCode).toMatch(/^[A-Z0-9]+$/);

  return { gameId, gameUrl, joinCode };
}

/**
 * Create a text + auto-validated mission from the Setup page. Returns once
 * we're back on Setup with the mission visible.
 */
export async function createTextMission(
  page: Page,
  gameId: string,
  opts: { title: string; answer: string; points?: number },
): Promise<void> {
  await page.goto(`/games/${gameId}/missions/new`);
  await page.locator('input[name="title"]').fill(opts.title);
  // Defaults are submission_type=text, validation=auto, so the expected
  // answer field is shown and required.
  await page.locator('input[name="expected_answer"]').fill(opts.answer);
  if (opts.points != null) {
    await page.locator('input[name="points"]').fill(String(opts.points));
  }
  await page.getByRole("button", { name: /create mission/i }).click();

  await page.waitForURL(new RegExp(`/games/${gameId}$`));
  await expect(page.getByText(opts.title)).toBeVisible();
}

/**
 * Start a game now (new games are created in 'draft'). Lands on the
 * settings page with the status flipped to active.
 */
export async function startGame(page: Page, gameId: string): Promise<void> {
  await page.goto(`/games/${gameId}/settings`);
  await page.getByRole("button", { name: /start now/i }).click();
  await expect(page.locator(".pill", { hasText: /active/i })).toBeVisible();
}

/**
 * Create a GM-judged text mission (validation = GM judged) so a player's
 * submission lands in the review queue as "pending" instead of being
 * auto-approved. Returns once back on Setup with the mission visible.
 */
export async function createJudgedTextMission(
  page: Page,
  gameId: string,
  opts: { title: string },
): Promise<void> {
  await page.goto(`/games/${gameId}/missions/new`);
  await page.locator('input[name="title"]').fill(opts.title);
  await page
    .locator('select[name="validation_mode"]')
    .selectOption("gm_judged");
  await page.getByRole("button", { name: /create mission/i }).click();
  await page.waitForURL(new RegExp(`/games/${gameId}$`));
  await expect(page.getByText(opts.title)).toBeVisible();
}

/**
 * As a player already on a team, open a mission from the missions list and
 * submit a text answer. Returns to the missions list afterward.
 */
export async function submitTextMission(
  page: Page,
  joinCode: string,
  opts: { title: string; answer: string },
): Promise<void> {
  await page.goto(`/play/${joinCode}`);
  await page.locator("a", { hasText: opts.title }).click();
  await page.waitForURL(/\/play\/.+\/m\/.+/);
  await page.locator('textarea[name="payload_text"]').fill(opts.answer);
  await page.getByRole("button", { name: /submit answer/i }).click();
  await page.waitForURL(new RegExp(`/play/${joinCode}$`, "i"));
}

/**
 * Join a game as an anonymous guest via /play. Lands on the team picker.
 */
export async function joinAsGuest(
  page: Page,
  opts: { name: string; joinCode: string },
): Promise<void> {
  await page.goto("/play");
  await page.locator('input[name="display_name"]').fill(opts.name);
  await page.locator('input[name="join_code"]').fill(opts.joinCode);
  await page.getByRole("button", { name: /join as guest/i }).click();
  await page.waitForURL(new RegExp(`/play/${opts.joinCode}$`, "i"));
}

/** Click the Join button on a specific team in the team picker. */
export async function pickTeam(page: Page, teamName: string): Promise<void> {
  await page
    .locator("li")
    .filter({ hasText: teamName })
    .getByRole("button", { name: /^join$/i })
    .click();
  // After joining, the missions section renders.
  await expect(
    page.getByRole("heading", { name: /missions/i }),
  ).toBeVisible();
}
