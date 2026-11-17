import { expect, test } from "@playwright/test";

/**
 * Two-browser realtime messaging acceptance.
 * Requires LINKBOOKS_E2E_MESSAGING=1 plus two authenticated storage states
 * (MESSAGING_USER_A_STATE / MESSAGING_USER_B_STATE) against a migrated staging app.
 * Skips cleanly when credentials are absent so CI remains honest.
 */
const enabled = process.env["LINKBOOKS_E2E_MESSAGING"] === "1";
const stateA = process.env["MESSAGING_USER_A_STATE"];
const stateB = process.env["MESSAGING_USER_B_STATE"];
const baseURL = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:8080";

test.describe("messaging realtime (two browsers)", () => {
  test.skip(!enabled || !stateA || !stateB, "Set LINKBOOKS_E2E_MESSAGING=1 and dual auth states");

  test("authorised peers exchange a durable DM", async ({ browser }) => {
    const contextA = await browser.newContext({
      storageState: stateA,
      baseURL,
    });
    const contextB = await browser.newContext({
      storageState: stateB,
      baseURL,
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto("/messages");
    await expect(pageA.getByRole("heading", { name: "Messages" })).toBeVisible();
    await pageB.goto("/messages");
    await expect(pageB.getByRole("heading", { name: "Messages" })).toBeVisible();

    await pageA.getByRole("button", { name: "New message" }).click();
    // Peer discovery UI: select first eligible peer when present.
    const peer = pageA.locator('[aria-label="New direct message"] button').first();
    if (await peer.count()) {
      await peer.click();
    }

    const body = `e2e-messaging-${Date.now()}`;
    await pageA.getByLabel("Message").fill(body);
    await pageA.getByRole("button", { name: "Send" }).click();
    await expect(pageA.getByText(body)).toBeVisible({ timeout: 20_000 });
    await expect(pageB.getByText(body)).toBeVisible({ timeout: 30_000 });

    await contextA.close();
    await contextB.close();
  });
});
