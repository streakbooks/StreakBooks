import { expect, test, type Page } from "@playwright/test";
import type {
  BrowserRecognition,
  RecognitionEvent,
} from "../../src/lib/ai-voice/browser-recognition";

declare global {
  interface Window {
    voiceSpeech: {
      starts: number;
      aborts: number;
      result(text: string): void;
      error(error: string): void;
      queuedResult: ((event: RecognitionEvent) => void) | null;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.voiceSpeech = {
      starts: 0,
      aborts: 0,
      queuedResult: null,
      result(text) {
        MockSpeech.latest.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
      },
      error(error) {
        MockSpeech.latest.onerror?.({ error });
      },
    };
    class MockSpeech {
      static latest: MockSpeech;
      lang = "";
      continuous = true;
      interimResults = true;
      maxAlternatives = 0;
      onstart: BrowserRecognition["onstart"] = null;
      onresult: BrowserRecognition["onresult"] = null;
      onerror: BrowserRecognition["onerror"] = null;
      onend: BrowserRecognition["onend"] = null;
      constructor() {
        MockSpeech.latest = this;
      }
      start() {
        window.voiceSpeech.starts++;
        window.voiceSpeech.queuedResult = this.onresult;
        this.onstart?.();
      }
      abort() {
        window.voiceSpeech.aborts++;
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: MockSpeech, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
});

async function openAndStart(page: Page) {
  await page.getByRole("button", { name: "Open voice commands" }).click();
  await expect(page.getByRole("status")).toContainText("Microphone off");
  expect(await page.evaluate(() => window.voiceSpeech.starts)).toBe(0);
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Listening…");
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
  test(`speech navigates: ${phrase}`, async ({ page }) => {
    if (destination === "/") await page.goto("/contacts");
    await openAndStart(page);
    await page.evaluate((text) => window.voiceSpeech.result(text), phrase);
    await expect(page).toHaveURL(`http://127.0.0.1:8081${destination}`);
    await expect(
      page.getByRole("heading", { name: `Destination: ${destination}`, exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.voiceSpeech.aborts)).toBe(1);
    // A duplicate final already queued by the browser must not navigate again.
    await page.evaluate(() =>
      window.voiceSpeech.queuedResult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "open banking" } }],
      }),
    );
    await expect(page).toHaveURL(`http://127.0.0.1:8081${destination}`);
  });
}

test("unrecognised and financial commands stop without navigation or requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") requests.push(request.url());
  });
  await openAndStart(page);
  await page.evaluate(() => window.voiceSpeech.result("open invoices and approve them"));
  await expect(page.getByRole("status")).toContainText("Command not recognised");
  await expect(page.getByRole("status")).toContainText("Microphone off");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  expect(requests).toEqual([]);
});

test("permission denial explains recovery and allows retry", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => window.voiceSpeech.error("not-allowed"));
  await expect(page.getByRole("status")).toContainText("Microphone permission denied");
  await expect(page.getByRole("status")).toContainText("site settings");
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Listening…");
});

test("unsupported browsers retain keyboard and mouse navigation", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
  });
  await page.getByRole("button", { name: "Open voice commands" }).click();
  await expect(page.getByRole("alert")).toContainText("not supported in this browser");
  await expect(page.getByRole("button", { name: "Start listening", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Contacts link" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("http://127.0.0.1:8081/contacts");
  await page.getByRole("link", { name: "Dashboard link" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
});

test("Stop and Escape discard queued speech", async ({ page }) => {
  await openAndStart(page);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Listening stopped");
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await expect.poll(() => page.evaluate(() => window.voiceSpeech.aborts)).toBe(2);
});

test("read-only permissions allow invoices but block creation", async ({ page }) => {
  await page.evaluate(() =>
    window.voiceFixture.setContext({ permissions: ["company.view", "sales.view"] }),
  );
  await openAndStart(page);
  await page.evaluate(() => window.voiceSpeech.result("create invoice"));
  await expect(page.getByRole("status")).toContainText("do not have permission");
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await page.evaluate(() => window.voiceSpeech.result("open invoices"));
  await expect(page).toHaveURL("http://127.0.0.1:8081/sales/invoices");
});

test("company and permission changes cancel the old speech session", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => window.voiceFixture.setContext({ companyId: "company-b" }));
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await page.getByRole("button", { name: "Open voice commands" }).click();
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await page.evaluate(() => window.voiceFixture.setContext({ permissions: ["company.view"] }));
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.evaluate(() => window.voiceSpeech.aborts)).toBe(2);
});

test("feature disable, lookup failure and company removal fail closed", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => window.voiceFixture.setContext({ enabled: false }));
  await expect(page.getByRole("button", { name: "Open voice commands" })).not.toBeVisible();
  expect(await page.evaluate(() => window.voiceSpeech.aborts)).toBe(1);
  await page.evaluate(() => window.voiceFixture.setContext({ enabled: true }));
  await expect(page.getByRole("button", { name: "Open voice commands" })).toBeVisible();
  await page.evaluate(() => window.voiceFixture.setContext({ featureError: true }));
  await expect(page.getByRole("button", { name: "Open voice commands" })).not.toBeVisible();
  await page.evaluate(() =>
    window.voiceFixture.setContext({ featureError: false, companyId: null }),
  );
  await expect(page.getByRole("button", { name: "Open voice commands" })).not.toBeVisible();
});

test("prefixed Web Speech support works on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => {
    const constructor = Object.getOwnPropertyDescriptor(window, "SpeechRecognition")?.value;
    Object.defineProperty(window, "webkitSpeechRecognition", { value: constructor });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
  });
  await openAndStart(page);
  await expect(page.getByText(/may require internet access and may send audio/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.voiceSpeech.result("open bills"));
  await expect(page).toHaveURL("http://127.0.0.1:8081/purchases/bills");
});

test("network errors and a hidden tab stop the microphone", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => window.voiceSpeech.error("network"));
  await expect(page.getByRole("status")).toContainText("internet access");
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("status")).toContainText("Microphone off");
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  expect(await page.evaluate(() => window.voiceSpeech.aborts)).toBe(2);
});

test("insecure contexts explain why microphone access is disabled", async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(window, "isSecureContext", { value: false }));
  await page.getByRole("button", { name: "Open voice commands" }).click();
  await expect(page.getByRole("alert")).toContainText("requires HTTPS or localhost");
  await expect(page.getByRole("button", { name: "Start listening", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.voiceSpeech.starts)).toBe(0);
});

test("page suspension leaves a stopped, restartable control", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByRole("status")).toContainText("Microphone off");
  await expect(page.getByRole("button", { name: "Start listening", exact: true })).toBeEnabled();
  await page.evaluate(() =>
    window.voiceSpeech.queuedResult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open banking" } }],
    }),
  );
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
});
