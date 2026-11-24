import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Real app/router/components, anonymous contexts, no authentication or financial mutations.
for (const mode of ["light", "dark"]) {
  for (const [route, heading] of [
    ["/auth", "Welcome back"],
    ["/forgot-password", "Reset your password"],
    ["/reset-password", "Choose a new password"],
    ["/portal/login", "Customer and supplier portal"],
    ["/advisors", "Your business deserves better financial clarity."],
  ]) {
    test(`${route} renders accessibly in ${mode} without external requests`, async ({ page }) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (request) => {
        const url = new URL(request.request().url());
        if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
          external.push(url.hostname);
          return request.abort();
        }
        return request.continue();
      });
      await page.addInitScript((theme) => localStorage.setItem("streakbooks-theme", theme), mode);
      const response = await page.goto(route!, { waitUntil: "domcontentloaded", timeout: 90_000 });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1440, 768, 375]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }
}
