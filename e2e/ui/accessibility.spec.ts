import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("list workspace fixture has no serious WCAG axe violations", async ({ page }) => {
  await page.goto("/sales/invoices");
  const workspace = page.locator('[data-slot="list-workspace"]');
  await expect(workspace).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Invoices", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-slot="list-workspace"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("record workspace fixture has no serious WCAG axe violations", async ({ page }) => {
  await page.goto("/?flow=bill");
  const workspace = page.locator('[data-slot="record-workspace"]');
  await expect(workspace).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "New bill", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-slot="record-workspace"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("money validation announces the matching error and clears it after correction", async ({
  page,
}) => {
  await page.goto("/?flow=accessibility");
  const amount = page.getByRole("textbox", { name: "Transfer amount", exact: true });
  const destination = page.getByRole("textbox", { name: "Destination amount", exact: true });
  await expect(amount).toHaveAccessibleDescription("Not a valid amount");
  await expect(destination).toHaveAccessibleDescription("Not a valid amount");
  expect(await amount.getAttribute("aria-describedby")).not.toBe(
    await destination.getAttribute("aria-describedby"),
  );
  await amount.fill("1,250.50");
  await expect(amount).toHaveAttribute("aria-invalid", "false");
  await expect(amount).not.toHaveAttribute("aria-describedby");
  await expect(destination).toHaveAttribute("aria-invalid", "true");
});
test("record lookup keeps its label, validation and selected value through keyboard search", async ({
  page,
}) => {
  await page.goto("/?flow=accessibility");
  const control = page.getByRole("combobox", { name: "Customer record", exact: true });
  await expect(control).toHaveAttribute("id", "customer-record");
  await expect(control).toHaveAccessibleDescription(
    "Choose the customer for this transaction. A customer is required.",
  );
  await expect(control).toHaveAttribute("aria-invalid", "true");
  await expect(control).toHaveAttribute("aria-required", "true");
  await control.click();
  const search = page.getByRole("searchbox");
  await search.fill("River");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(control).toContainText("River & Co");
  await expect(control).toHaveAccessibleDescription("Choose the customer for this transaction.");
  await expect(control).not.toHaveAttribute("aria-invalid", "true");
});
test("settings search has an accessible name and restores focus after Escape", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?flow=accessibility");
  const trigger = page.getByRole("button", { name: "Search settings", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search settings and modules" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search settings or modules" })).toBeFocused();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
test("checkout provider refresh preserves drafts and invalid entries cannot hand off to payment", async ({
  page,
}) => {
  await page.goto("/?flow=checkout");
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("Alex");
  const card = page.getByRole("radio", { name: /Cards, wallets/ });
  await card.click();
  await page.getByRole("button", { name: "Rerender checkout" }).click();
  await expect(card).toBeChecked();
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Alex");
  await page.getByRole("radio", { name: /UPI AutoPay/ }).click();
  await page.getByRole("button", { name: "Disable Razorpay fixture" }).click();
  await expect(card).toBeChecked();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Checkout handoffs: 0");
});
for (const mode of ["light", "dark"]) {
  for (const palette of [
    "classic",
    "sapphire",
    "rose",
    "amethyst",
    "emerald",
    "teal",
    "champagne",
    "graphite",
    "custom",
  ]) {
    test(`financial field accessibility: ${palette} ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addInitScript(
        ({ mode, palette }) => {
          localStorage.setItem("linkbooks-theme", mode);
          localStorage.setItem("linkbooks-theme-palette", palette);
          localStorage.setItem(
            "linkbooks-theme-custom",
            JSON.stringify({
              primary: "#ffffff",
              sidebar: "#ffffff",
              lightBackground: "#ffffff",
              darkBackground: "#101820",
            }),
          );
        },
        { mode, palette },
      );
      await page.goto("/?flow=accessibility");
      await expect(page.locator("html")).toHaveAttribute("data-linkbooks-palette", palette);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}

test("settings results preserve native new tabs and keyboard section selection", async ({
  page,
  context,
}) => {
  await page.goto("/?flow=accessibility");
  await page.getByRole("button", { name: "Search settings", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Search settings or modules" });
  await search.fill("Feature Manager");
  const result = page.getByRole("option", { name: /Feature Manager/ });
  await expect(result).toHaveAttribute("href", "/settings?section=features");
  const opened = context.waitForEvent("page");
  await result.click({ modifiers: ["Control"] });
  const tab = await opened;
  await expect(tab).toHaveURL(/settings\?section=features/);
  await tab.close();
  await expect(page.getByRole("dialog", { name: "Search settings and modules" })).toBeVisible();
  await search.focus();
  await search.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Settings destination: features", { exact: true })).toBeVisible();
});

test("CAPTCHA hook keeps verification tokens single-use after module separation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.turnstile = {
      render: (element, options) => {
        const button = document.createElement("button");
        button.textContent = "Complete fixture verification";
        button.onclick = () => {
          (options["callback"] as (token: string) => void)("browser-local-fixture-token");
        };
        element.appendChild(button);
        return "fixture-widget";
      },
      reset: () => {
        document.documentElement.dataset.captchaResets = "1";
      },
      remove: () => {},
    };
  });
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1")) external.push(request.url());
  });
  await page.goto("/?flow=captcha");
  await expect(page.getByRole("status")).toHaveText("Verification required");
  const finish = page.getByRole("button", { name: "Finish fixture request" });
  await expect(finish).toBeDisabled();
  await page.getByRole("button", { name: "Complete fixture verification" }).click();
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(finish).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Verification required");
  await expect(page.locator("html")).toHaveAttribute("data-captcha-resets", "1");
  expect(external).toEqual([]);
});

test("settings pointer selection navigates once and closes the command dialog", async ({
  page,
}) => {
  await page.goto("/?flow=accessibility");
  const history = await page.evaluate(() => window.history.length);
  await page.getByRole("button", { name: "Search settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Search settings or modules" }).fill("Feature Manager");
  await page.getByRole("option", { name: /Feature Manager/ }).click();
  await expect(page).toHaveURL(/settings\?section=features/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.history.length)).toBe(history + 1);
});
