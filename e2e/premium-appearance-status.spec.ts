import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/auth?redirect=%2F");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
}

test.describe("LinkBooks premium appearance: authenticated application shell", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Requires an authorised E2E organisation");
  });

  test("all named palettes update shared tokens and survive a refresh", async ({ page }) => {
    await signIn(page);
    const appearance = page.getByRole("button", { name: "Appearance and colour themes" });
    await appearance.click();

    const presets = [
      ["classic", "LinkBooks Signature"],
      ["graphite", "Executive Slate"],
      ["emerald", "Emerald Professional"],
      ["amethyst", "Royal Indigo"],
      ["teal", "Modern Teal"],
      ["rose", "Rose Professional"],
      ["champagne", "Warm Sand"],
    ] as const;
    for (const [id, name] of presets) {
      await page.getByRole("menuitem", { name: new RegExp(name) }).click();
      await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", id);
      const theme = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return {
          primary: css.getPropertyValue("--primary").trim(),
          chart: css.getPropertyValue("--chart-1").trim(),
          completion: css.getPropertyValue("--complete-soft").trim(),
        };
      });
      expect(theme.primary).toBeTruthy();
      expect(theme.chart).toBeTruthy();
      expect(theme.completion).toBeTruthy();
    }
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", "champagne");
  });

  test("appearance persists across connected workspaces without recolouring statuses", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Appearance and colour themes" }).click();
    await page.getByRole("menuitem", { name: /Rose Professional/ }).click();
    const before = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--complete-ink").trim(),
    );
    for (const route of ["/", "/banking", "/sales", "/purchases", "/accounting", "/reports"]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", "rose");
      const completion = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--complete-ink").trim(),
      );
      expect(completion).toBe(before);
    }
  });

  test("custom accent control is independent of the primary colour", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Appearance and colour themes" }).click();
    await page.getByRole("menuitem", { name: /Create your own palette/ }).click();
    const dialog = page.getByRole("dialog", { name: "Personalise LinkBooks" });
    await expect(dialog.getByLabel("Primary colour")).toBeVisible();
    await expect(dialog.getByLabel("Accent colour")).toBeVisible();
    await expect(dialog.getByLabel("Live palette preview")).toBeVisible();
  });
});
