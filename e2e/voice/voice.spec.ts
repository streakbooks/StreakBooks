import { expect, test, type Page } from "@playwright/test";
import type {
  BrowserRecognition,
  RecognitionEvent,
} from "../../src/lib/ai-voice/browser-recognition";
import { navItems } from "../../src/lib/nav";

declare global {
  interface Window {
    voiceSpeech: {
      starts: number;
      ready: boolean;
      aborts: number;
      result(text: string): void;
      end(): void;
      error(error: string): void;
      queuedResult: ((event: RecognitionEvent) => void) | null;
    };
  }
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeech {
      static latest: MockSpeech;
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: BrowserRecognition["onstart"] = null;
      onresult: BrowserRecognition["onresult"] = null;
      onerror: BrowserRecognition["onerror"] = null;
      onend: BrowserRecognition["onend"] = null;
      constructor() {
        MockSpeech.latest = this;
      }
      start() {
        window.voiceSpeech.ready = true;
        window.voiceSpeech.starts++;
        window.voiceSpeech.queuedResult = this.onresult;
        this.onstart?.();
      }
      abort() {
        window.voiceSpeech.ready = false;
        window.voiceSpeech.aborts++;
      }
    }
    window.voiceSpeech = {
      starts: 0,
      ready: false,
      aborts: 0,
      queuedResult: null,
      result(text) {
        MockSpeech.latest.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
      },
      end() {
        MockSpeech.latest.onend?.();
      },
      error(error) {
        MockSpeech.latest.onerror?.({ error });
      },
    };
    Object.defineProperty(window, "SpeechRecognition", { value: MockSpeech, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.route("https://voice-fixture.invalid/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open voice assistant" })).toBeVisible();
});
async function activate(page: Page) {
  await page.getByRole("button", { name: "Open voice assistant" }).click();
  expect(await page.evaluate(() => window.voiceSpeech.starts)).toBe(0);
  await page.getByRole("button", { name: "Start assistant", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.starts)).toBe(1);
}
async function say(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.ready)).toBe(true);
  const before = await page.evaluate(() => window.voiceSpeech.starts);
  await page.evaluate((command) => window.voiceSpeech.result(command), text);
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.starts)).toBeGreaterThan(before);
}
async function typed(page: Page, command: string) {
  await page.getByRole("textbox", { name: "Type an assistant command" }).fill(command);
  await page.getByRole("button", { name: "Run", exact: true }).click();
}

for (const [phrase, destination] of [
  ["open dashboard", "/"],
  ["open invoices", "/sales/invoices"],
  ["open bills", "/purchases/bills"],
  ["open banking", "/banking"],
  ["open contacts", "/contacts"],
  ["create invoice", "/sales/invoices/new"],
  ["create bill", "/purchases/bills/new"],
] as const) {
  test(`stays active after ${phrase}`, async ({ page }) => {
    await activate(page);
    await say(page, phrase);
    await expect(page).toHaveURL(`http://127.0.0.1:8081${destination}`);
    await expect(page.getByRole("status")).toContainText("Assistant active");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await say(page, "open reports");
    await expect(page).toHaveURL("http://127.0.0.1:8081/reports");
  });
}
for (const item of navItems) {
  test(`catalog navigation: ${item.label}`, async ({ page }) => {
    await activate(page);
    await say(page, `open ${item.label}`);
    await expect(page).toHaveURL(`http://127.0.0.1:8081${item.to}`);
  });
}

test("multi-step invoice uses the real editor and only saves after screen confirmation", async ({
  page,
}) => {
  await activate(page);
  await say(page, "create a new invoice");
  await expect(page.getByRole("heading", { name: "New invoice", exact: true })).toBeVisible();
  await say(page, "select customer ABC");
  await expect(page.getByRole("list", { name: "Matching records" })).toBeVisible();
  await say(page, "1");
  await say(page, "set invoice date to October 31, 2026");
  await say(page, "add consulting services for GBP 1500");
  await say(page, "use account Consulting income");
  await say(page, "set tax code to Zero rate");
  await say(page, "change that to GBP 1800");
  await say(page, "set due date to November 15, 2026");
  await say(page, "save invoice");
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toBeVisible();
  await expect(page.getByLabel("Draft save confirmation")).toContainText("ABC Limited");
  await expect(page.getByLabel("Draft save confirmation")).toContainText("1800");
  await page.screenshot({ path: "work/signal-invoice.png" });
  await say(page, "yes");
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.filter((call) => call.name === "saveInvoiceDraft").length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page).toHaveURL(/sales\/invoices\/00000000-0000-4000-8000-000000000099$/);
  const payload = await page.evaluate(
    () => window.voiceServer.calls.find((call) => call.name === "saveInvoiceDraft")?.data,
  );
  expect(payload).toMatchObject({
    contactId: "00000000-0000-4000-8000-000000000001",
    invoiceDate: "2026-10-31",
    dueDate: "2026-11-15",
    currencyCode: "GBP",
    lines: [
      {
        description: "consulting services",
        unitPriceMinor: 180000,
        accountId: "00000000-0000-4000-8000-000000000011",
      },
    ],
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.voiceServer.calls.filter((call) => call.name === "recordVoiceDraftOutcome").length,
      ),
    )
    .toBe(1);
  await expect(page.getByRole("status")).toContainText("Assistant active");
  await say(page, "open dashboard");
  await page.getByRole("button", { name: "Stop assistant", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("Microphone off");
});

test("new bill supports supplier, dates, lines and confirmed draft saving", async ({ page }) => {
  await activate(page);
  await say(page, "create bill");
  await say(page, "select supplier ABC Limited");
  await say(page, "set bill date to October 31, 2026");
  await say(page, "add consulting services for GBP 250");
  await say(page, "use account Consulting expense");
  await say(page, "set due date to November 15, 2026");
  await say(page, "set supplier invoice number to SUP-123");
  await say(page, "save bill");
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page).toHaveURL(/purchases\/bills\/00000000-0000-4000-8000-000000000099$/);
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.find((call) => call.name === "saveBillDraft")?.data,
    ),
  ).toMatchObject({
    supplierInvoiceNumber: "SUP-123",
    billDate: "2026-10-31",
    dueDate: "2026-11-15",
    lines: [{ unitPriceMinor: 25000 }],
  });
});

for (const [noun, route, save] of [
  ["quote", "/sales/quotes", "saveQuoteDraft"],
  ["credit note", "/sales/credit-notes", "saveCreditNoteDraft"],
] as const) {
  test(`existing ${noun} editor uses its draft handler and keeps Signal active`, async ({
    page,
  }) => {
    await activate(page);
    await say(page, `create ${noun}`);
    await say(page, "select customer ABC Limited");
    await say(page, "add services for GBP 75");
    await say(page, "use account Consulting income");
    await say(page, `save ${noun}`);
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page).toHaveURL(
      `http://127.0.0.1:8081${route}/00000000-0000-4000-8000-000000000099`,
    );
    expect(
      await page.evaluate(
        (name) => window.voiceServer.calls.filter((call) => call.name === name).length,
        save,
      ),
    ).toBe(1);
    await expect(page.getByRole("status")).toContainText("Assistant active");
  });
}

test("create invoice for a named customer carries intent across form loading", async ({ page }) => {
  await activate(page);
  await say(page, "create an invoice for ABC Limited");
  await expect(page).toHaveURL("http://127.0.0.1:8081/sales/invoices/new");
  await expect(page.getByTestId("assistant-message")).toContainText("Selected ABC Limited");
});

test("clarification keeps the current amount/date action and rejects an uncertain save retry", async ({
  page,
}) => {
  await activate(page);
  await say(page, "create invoice");
  await say(page, "select customer ABC Limited");
  await say(page, "add consulting for $1500");
  await expect(page.getByTestId("assistant-message")).toContainText("Which currency");
  await say(page, "GBP 1500");
  await say(page, "use account Consulting income");
  await say(page, "set due date to 03/04/2026");
  await expect(page.getByTestId("assistant-message")).toContainText("Which date");
  await say(page, "November 15, 2026");
  await say(page, "save invoice");
  await page.evaluate(() => {
    window.voiceServer.failSave = true;
  });
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page.getByTestId("assistant-message")).toContainText("no automatic retry");
  await say(page, "save draft");
  await expect(page.getByTestId("assistant-message")).toContainText("uncertain");
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.filter((call) => call.name === "saveInvoiceDraft").length,
    ),
  ).toBe(1);
});

test("manual edits invalidate the reviewed save details", async ({ page }) => {
  await activate(page);
  await say(page, "create invoice");
  await say(page, "select customer ABC Limited");
  await say(page, "add consulting for GBP 100");
  await say(page, "use account Consulting income");
  await say(page, "save invoice");
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toBeVisible();
  await page.locator('input[type="date"]').first().fill("2026-11-01");
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.filter((call) => call.name === "saveInvoiceDraft").length,
    ),
  ).toBe(0);
});

test("linked credit-note customer and currency locks also apply to voice", async ({ page }) => {
  await page.goto("/sales/credit-notes/linked");
  await activate(page);
  await say(page, "select customer ABC Services");
  await expect(page.getByTestId("assistant-message")).toContainText("customer cannot be changed");
  await say(page, "set currency to USD");
  await expect(page.getByTestId("assistant-message")).toContainText("must keep the source invoice");
  expect(
    await page.evaluate(
      () => window.voiceServer.calls.filter((call) => call.name.startsWith("save")).length,
    ),
  ).toBe(0);
});

test("recognition endings recover, and minimising or mouse navigation keeps activation", async ({
  page,
}) => {
  await activate(page);
  await page.getByRole("button", { name: "Minimise assistant" }).click();
  await page.getByRole("link", { name: "Contacts link" }).click();
  await expect(page.getByRole("status")).toContainText("Assistant active");
  const count = await page.evaluate(() => window.voiceSpeech.starts);
  await page.evaluate(() => window.voiceSpeech.end());
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.starts)).toBeGreaterThan(count);
  await say(page, "open banking");
  await expect(page).toHaveURL(/banking$/);
});

test("Stop discards queued results, and keyboard can activate and deactivate", async ({ page }) => {
  await activate(page);
  await page.getByRole("button", { name: "Stop assistant", exact: true }).first().click();
  const count = await page.evaluate(() => window.voiceSpeech.starts);
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await page.keyboard.press("Control+Shift+Space");
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.starts)).toBeGreaterThan(count);
  await page.keyboard.press("Control+Shift+Space");
  await expect(page.getByRole("status")).toContainText("Microphone off");
});

test("permission denial explains recovery without an automatic retry", async ({ page }) => {
  await activate(page);
  await page.evaluate(() => window.voiceSpeech.error("not-allowed"));
  await expect(page.getByTestId("assistant-message")).toContainText("permission denied");
  await expect(page.getByRole("status")).toContainText("Microphone off");
  expect(await page.evaluate(() => window.voiceSpeech.starts)).toBe(1);
});

test("unsupported browsers keep text commands and normal keyboard navigation", async ({ page }) => {
  await page.evaluate(() =>
    Object.defineProperty(window, "SpeechRecognition", { value: undefined }),
  );
  await page.getByRole("button", { name: "Open voice assistant" }).click();
  await expect(page.getByRole("alert")).toContainText("not supported");
  await expect(page.getByRole("button", { name: "Start assistant" })).toBeDisabled();
  await typed(page, "open invoices");
  await expect(page).toHaveURL(/sales\/invoices$/);
  await page.getByRole("link", { name: "Contacts link" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/contacts$/);
});

test("company, permission, user and feature changes stop and clear pending work", async ({
  page,
}) => {
  await activate(page);
  await page.evaluate(() => window.voiceFixture.setContext({ companyId: "other-company" }));
  await expect(page.getByRole("status")).toContainText("Microphone off");
  await page.getByRole("button", { name: "Start assistant" }).click();
  await expect(page.getByRole("status")).toContainText("Assistant active");
  await page.evaluate(() => window.voiceFixture.setContext({ permissions: ["company.view"] }));
  await expect(page.getByRole("status")).toContainText("Microphone off");
  await page.evaluate(() =>
    window.voiceFixture.setContext({ userId: "different-user", enabled: false }),
  );
  await expect(page.getByRole("button", { name: "Open voice assistant" })).toHaveCount(0);
});

test("hidden tabs pause rather than deactivate; return resumes safely", async ({ page }) => {
  await activate(page);
  const count = await page.evaluate(() => window.voiceSpeech.starts);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("assistant-message")).toContainText("paused");
  expect(await page.evaluate(() => window.voiceSpeech.starts)).toBe(count);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.starts)).toBeGreaterThan(count);
});

test("read-only permissions prevent form editing and financial commands remain manual", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.voiceFixture.setContext({ permissions: ["company.view", "sales.view"] }),
  );
  await activate(page);
  await say(page, "create invoice");
  await expect(page.getByTestId("assistant-message")).toContainText("do not have permission");
  await say(page, "pay supplier");
  await expect(page.getByTestId("assistant-message")).toContainText("normal review");
  expect(
    await page.evaluate(() =>
      window.voiceServer.calls.some((call) => call.name.startsWith("save")),
    ),
  ).toBe(false);
});

test("mobile prefixed API, reduced motion and non-modal controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const constructor = Object.getOwnPropertyDescriptor(window, "SpeechRecognition")?.value;
    Object.defineProperty(window, "webkitSpeechRecognition", { value: constructor });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
  });
  await activate(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText(/may require internet access and send audio/)).toBeVisible();
  await page.screenshot({ path: "work/signal-mobile.png" });
  await say(page, "open contacts");
  await expect(page).toHaveURL(/contacts$/);
});
