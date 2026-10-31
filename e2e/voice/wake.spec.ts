import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
declare global {
  interface Window {
    wakeTest: {
      starts: number;
      requests: number;
      tracks: MediaStreamTrack[];
      command(text: string): void;
    };
  }
}
/** Only command ASR is stubbed. Wake capture, AudioWorklet, VAD, MFCC and DTW run unchanged. */
async function speechObserver(page: Page) {
  await page.addInitScript(() => {
    let latest: { onresult: ((e: unknown) => void) | null } | undefined;
    window.wakeTest = {
      starts: 0,
      requests: 0,
      tracks: [],
      command(text) {
        latest?.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
      },
    };
    class CommandRecognition {
      onstart: (() => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      onerror = null;
      onend = null;
      constructor() {
        latest = { onresult: (event: unknown) => this.onresult?.(event) };
      }
      start() {
        window.wakeTest.starts++;
        this.onstart?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: CommandRecognition,
      configurable: true,
    });
    const actual = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.wakeTest.requests++;
      const stream = await actual(constraints);
      window.wakeTest.tracks.push(...stream.getTracks());
      return stream;
    };
  });
}
async function launch(audio: string, storageState?: StorageState) {
  const browser = await chromium.launch({
    ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : { channel: "chromium" }),
    args: [
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${resolve(`e2e/voice/audio/${audio}.wav`)}`,
    ],
  });
  const context = await browser.newContext({
    permissions: ["microphone"],
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  await speechObserver(page);
  await page.goto("http://127.0.0.1:8081/");
  await page.getByRole("button", { name: "Open voice assistant" }).click();
  await page.getByText("Wake phrase settings", { exact: true }).click();
  return { browser, context, page };
}
async function enroll(audio = "enrollment", phrase = "Hey LinkBooks") {
  const { browser, context, page } = await launch(audio);
  try {
    expect(await page.evaluate(() => window.wakeTest.requests)).toBe(0);
    if (phrase !== "Hey LinkBooks") {
      await page.getByLabel("Activation phrase", { exact: true }).fill(phrase);
      await page.getByRole("button", { name: "Save phrase", exact: true }).click();
    }
    await page.getByLabel("Enable wake detection", { exact: true }).check();
    expect(await page.evaluate(() => window.wakeTest.requests)).toBe(0);
    await page.getByRole("button", { name: "Enroll phrase", exact: true }).click();
    await expect(page.getByTestId("wake-message")).toContainText("Phrase enrolled", {
      timeout: 20000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.wakeTest.tracks.every((t) => t.readyState === "ended")),
      )
      .toBe(true);
    expect(await page.evaluate(() => window.wakeTest.starts)).toBe(0);
    const storage = await context.storageState();
    return storage;
  } finally {
    await browser.close();
  }
}
let profile: StorageState;
test.beforeAll(async () => {
  profile = await enroll();
});

test("real PCM enrollment and held-out wake activation precede persistent invoice commands", async () => {
  test.setTimeout(45000);
  const { browser, page } = await launch("hey-linkbooks-heldout", profile);
  try {
    expect(await page.evaluate(() => window.wakeTest.requests)).toBe(0); // persisted preference never auto-captures
    await page.getByRole("button", { name: "Arm wake detection", exact: true }).click();
    await expect(page.getByTestId("wake-message")).toContainText("Wake microphone on");
    await expect
      .poll(() => page.evaluate(() => window.wakeTest.starts), { timeout: 15000 })
      .toBe(1);
    expect(
      await page.evaluate(() => window.wakeTest.tracks.every((t) => t.readyState === "ended")),
    ).toBe(true);
    const say = async (text: string) => {
      const before = await page.evaluate(() => window.wakeTest.starts);
      await page.evaluate((t) => window.wakeTest.command(t), text);
      await expect.poll(() => page.evaluate(() => window.wakeTest.starts)).toBeGreaterThan(before);
    };
    await say("create invoice");
    await say("select customer ABC Limited");
    await say("go to description");
    await say("Services through acoustic wake activation");
    await say("go to unit price");
    await say("125");
    await say("go to account");
    await say("Consulting income");
    await say("save invoice");
    await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => window.voiceServer.calls.filter((c) => c.name === "saveInvoiceDraft").length,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page).toHaveURL(/sales\/invoices\/00000000-0000-4000-8000-000000000099$/);
    await say("open purchases");
    await say("open banking");
    await page.evaluate(() => window.wakeTest.command("stop listening"));
    await expect(page.getByTestId("wake-message")).toContainText("Wake microphone on");
    await page.getByRole("button", { name: "Stop all microphones", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.wakeTest.tracks.every((t) => t.readyState === "ended")),
      )
      .toBe(true);
    const starts = await page.evaluate(() => window.wakeTest.starts);
    await page.waitForTimeout(3500);
    expect(await page.evaluate(() => window.wakeTest.starts)).toBe(starts);
  } finally {
    await browser.close();
  }
});
for (const audio of ["open-invoices-heldout", "hey-link-cooks-heldout"])
  test(`real PCM distractor does not activate: ${audio}`, async () => {
    const { browser, page } = await launch(audio, profile);
    try {
      await page.getByRole("button", { name: "Arm wake detection", exact: true }).click();
      await expect(page.getByTestId("wake-message")).toContainText("Wake microphone on");
      await page.waitForTimeout(6500);
      expect(await page.evaluate(() => window.wakeTest.starts)).toBe(0);
      await page.getByRole("button", { name: "Stop all microphones", exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() => window.wakeTest.tracks.every((t) => t.readyState === "ended")),
        )
        .toBe(true);
    } finally {
      await browser.close();
    }
  });
test("permission denial is visible and requires explicit retry", async () => {
  const { browser, context, page } = await launch("hey-linkbooks-heldout", profile);
  try {
    await context.clearPermissions();
    const cdp = await context.newCDPSession(page);
    const target = await cdp.send("Target.getTargetInfo");
    const contextId = target.targetInfo.browserContextId;
    if (!contextId) throw new Error("Expected an isolated browser context for permission testing.");
    await cdp.send("Browser.setPermission", {
      browserContextId: contextId,
      permission: { name: "microphone" },
      setting: "denied",
      origin: "http://127.0.0.1:8081",
    });
    await page.getByRole("button", { name: "Arm wake detection", exact: true }).click();
    await expect(page.getByTestId("wake-message")).toContainText("permission denied");
    expect(await page.evaluate(() => window.wakeTest.starts)).toBe(0);
  } finally {
    await browser.close();
  }
});

for (const [audio, phrase] of [
  ["hello-linkbooks", "Hello LinkBooks"],
  ["hey-luna", "Hey Luna"],
])
  test(`real PCM custom phrase: ${phrase}`, async () => {
    test.setTimeout(45000);
    const custom = await enroll(`${audio}-enrollment`, phrase);
    const { browser, page } = await launch(`${audio}-heldout`, custom);
    try {
      expect(await page.evaluate(() => window.wakeTest.requests)).toBe(0);
      await page.getByRole("button", { name: "Arm wake detection", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.wakeTest.starts), { timeout: 15000 })
        .toBe(1);
      expect(
        await page.evaluate(() => window.wakeTest.tracks.every((t) => t.readyState === "ended")),
      ).toBe(true);
      await page.getByRole("button", { name: "Stop all microphones", exact: true }).click();
    } finally {
      await browser.close();
    }
  });
