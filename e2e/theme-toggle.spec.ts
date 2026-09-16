import { test, expect } from "@playwright/test";

// Emulate an OS set to dark mode — the whole point is that the app still
// shows light by default (for the old-school presentation audience).
test.use({ colorScheme: "dark" });

test("light is the default over OS dark; toggle cycles and persists", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");

  // Default preference is light, even though the OS prefers dark.
  await expect(html).toHaveAttribute("data-color-scheme", "light");

  const toggle = page.getByRole("button", { name: /theme/i });
  await toggle.click(); // light -> dark
  await expect(html).toHaveAttribute("data-color-scheme", "dark");

  // Choice survives a reload (localStorage), with no flash to light.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-scheme",
    "dark",
  );

  // dark -> system: resolves against the OS (dark here).
  await page.getByRole("button", { name: /theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-scheme",
    "dark",
  );

  // system -> light: back to forced light.
  await page.getByRole("button", { name: /theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-scheme",
    "light",
  );
});
