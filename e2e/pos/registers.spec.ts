import { expect, test, type Page } from "@playwright/test";
async function chooseLookup(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
for (const width of [1440, 768, 390]) {
  test(`register setup, location access and count reconciliation at ${width}px (isolated fixture)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pos/registers");
    await page.getByLabel("Register code").fill("TILL-1");
    await page.getByLabel("Register name").fill("Front Counter");
    await chooseLookup(page, "Location", "City Store (CITY)");
    await chooseLookup(page, "Cash asset account", "1000 · Till cash");
    await page.getByRole("button", { name: "Create register", exact: true }).click();
    const register = page.getByRole("region", { name: "Front Counter" });
    await expect(register).toBeVisible();
    await chooseLookup(page, "Access location", "City Store");
    await chooseLookup(page, "Company member", "Cashier One (cashier@example.test)");
    await page.getByRole("button", { name: "Save location access" }).click();
    await expect(page.getByText("Location access updated.")).toBeVisible();
    await register.getByLabel("Opening float (USD)").fill("100.00");
    await register.getByRole("button", { name: "Open register" }).click();
    await expect(register.getByLabel("Counted cash (USD)")).toBeVisible();
    await expect(register.getByLabel("Counted cash (USD)")).toHaveValue("");
    await register.getByLabel("Counted cash (USD)").fill("99.00");
    await register.getByRole("button", { name: "Close session" }).click();
    await expect(register.getByRole("alert")).toContainText("Cash variance");
    await expect(register.getByLabel("Counted cash (USD)")).toBeVisible();
    await register.getByLabel("Counted cash (USD)").fill("100.00");
    await register.getByRole("button", { name: "Close session" }).click();
    await expect(register.getByLabel("Opening float (USD)")).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent closed sessions" })).toContainText(
      "Counted USD 100.00",
    );
    const revoke = page.getByRole("button", {
      name: "Revoke location access for Cashier One at City Store",
    });
    await revoke.click();
    await expect(page.getByText("Revoke this cashier's access to this location?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(revoke).toBeVisible();
    await revoke.click();
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await expect(page.getByText("No cashier location grants.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
