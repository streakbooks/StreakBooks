import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantController } from "./assistant-controller";
import type { BrowserRecognition, RecognitionEvent } from "./browser-recognition";
import { validateVoiceDraft, type VoiceFormAdapter } from "./form-adapter";
import { permissionsForRole } from "@/lib/permissions";

class Speech implements BrowserRecognition {
  static sessions: Speech[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: BrowserRecognition["onstart"] = null;
  onresult: BrowserRecognition["onresult"] = null;
  onerror: BrowserRecognition["onerror"] = null;
  onend: BrowserRecognition["onend"] = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  constructor() {
    Speech.sessions.push(this);
  }
  start() {
    this.onstart?.();
  }
  abort = vi.fn();
  result(text: string) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
  }
}
const latest = () => Speech.sessions.at(-1)!;
function setup() {
  const navigate = vi.fn(async () => {});
  const controller = new AssistantController({
    recognition: () => Speech,
    navigate,
    back: vi.fn(),
  });
  controller.setScope("user:company", "company", permissionsForRole("owner"), true);
  let form: VoiceFormAdapter;
  const saveDraft = vi.fn(async () => ({ id: "saved-invoice" }));
  const update = (patch: Partial<VoiceFormAdapter["draft"]>) => {
    form = { ...form, draft: { ...form.draft, ...patch } };
    form.revision = JSON.stringify(form.draft);
    controller.register(form);
  };
  form = {
    token: "form",
    companyId: "company",
    module: "invoice",
    permission: "sales.draft",
    revision: "initial",
    ready: true,
    busy: false,
    today: "2026-10-31",
    draft: {
      contactId: "",
      date: "2026-10-31",
      dueDate: "2026-11-30",
      currency: "GBP",
      memo: "",
      number: "",
      lines: [],
    },
    contacts: [
      { id: "abc", name: "ABC Limited" },
      { id: "abc2", name: "ABC Services" },
    ],
    accounts: [{ id: "income", name: "4000 Consulting income" }],
    taxes: [{ id: "vat", name: "Standard VAT", rateBps: 2000 }],
    currencies: ["GBP", "USD"],
    selectContact: (id) => update({ contactId: id }),
    update,
    updateLines: (lines) => update({ lines }),
    validate: () => validateVoiceDraft(form.draft, true),
    saveDraft,
  };
  controller.register(form);
  return { controller, navigate, saveDraft, update, form: () => form };
}

describe("persistent assistant lifecycle and workflows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Speech.sessions = [];
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  async function ready(controller: AssistantController) {
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
  }
  it("never starts on construction, then survives navigation and recognition termination", async () => {
    const { controller, navigate } = setup();
    expect(Speech.sessions).toHaveLength(0);
    await ready(controller);
    latest().result("open dashboard");
    await vi.advanceTimersByTimeAsync(350);
    controller.locationChanged();
    expect(controller.getSnapshot().active).toBe(true);
    latest().onend?.();
    await vi.advanceTimersByTimeAsync(650);
    expect(Speech.sessions).toHaveLength(3);
    latest().result("open invoices");
    await vi.advanceTimersByTimeAsync(350);
    expect(navigate.mock.calls).toEqual([["/"], ["/sales/invoices"]]);
    expect(controller.getSnapshot().phase).toBe("listening");
  });
  it("handles speech/transcription feedback and timeouts without deactivating", async () => {
    const { controller } = setup();
    await ready(controller);
    latest().onspeechstart?.();
    expect(controller.getSnapshot().phase).toBe("speech_detected");
    latest().onspeechend?.();
    expect(controller.getSnapshot().phase).toBe("transcribing");
    await vi.advanceTimersByTimeAsync(15_650);
    expect(controller.getSnapshot().active).toBe(true);
    expect(Speech.sessions).toHaveLength(2);
  });
  it("stops immediately and discards queued results and pending restarts", async () => {
    const { controller, navigate } = setup();
    await ready(controller);
    const queued = latest().onresult!;
    controller.stop();
    queued({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "open banking" } }] });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(navigate).not.toHaveBeenCalled();
    expect(Speech.sessions).toHaveLength(1);
  });
  it("pauses hidden/offline sessions and resumes only while activation is retained", async () => {
    const { controller } = setup();
    await ready(controller);
    controller.environment(false, true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(Speech.sessions).toHaveLength(1);
    expect(controller.getSnapshot().active).toBe(true);
    controller.environment(true, true);
    await vi.advanceTimersByTimeAsync(350);
    expect(Speech.sessions).toHaveLength(2);
    controller.stop();
    controller.environment(true, true);
    await vi.advanceTimersByTimeAsync(350);
    expect(Speech.sessions).toHaveLength(2);
  });
  it("does not loop after microphone denial", async () => {
    const { controller } = setup();
    await ready(controller);
    latest().onerror?.({ error: "not-allowed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.getSnapshot()).toMatchObject({ active: false, phase: "error" });
    expect(Speech.sessions).toHaveLength(1);
  });
  it("backs off transient network failures, then requires intervention", async () => {
    const { controller } = setup();
    await ready(controller);
    for (let i = 0; i < 5; i++) {
      latest().onerror?.({ error: "network" });
      await vi.advanceTimersByTimeAsync(8500);
    }
    expect(controller.getSnapshot()).toMatchObject({ active: false, phase: "error" });
  });
  it("completes a multi-turn draft through clarification, exact values and on-screen confirmation", async () => {
    const { controller, form, saveDraft } = setup();
    await ready(controller);
    await controller.submit("select customer ABC");
    expect(controller.getSnapshot().choices).toHaveLength(2);
    await controller.submit("1");
    expect(form().draft.contactId).toBe("abc");
    await controller.submit("set invoice date to October 31, 2026");
    await controller.submit("add consulting services for GBP 1500");
    await controller.submit("use account Consulting income");
    await controller.submit("set tax code to Standard VAT");
    await controller.submit("set due date to November 15, 2026");
    await controller.submit("change that to GBP 1800");
    expect(form().draft.lines[0]).toMatchObject({
      description: "consulting services",
      unitPrice: "1800",
      accountId: "income",
      taxCodeId: "vat",
      taxRateBps: "2000",
    });
    await controller.submit("save invoice");
    expect(controller.getSnapshot().confirmation?.details.join(" ")).toContain("1800");
    await controller.submit("yes");
    expect(saveDraft).not.toHaveBeenCalled();
    await controller.confirmSave();
    await controller.confirmSave();
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().active).toBe(true);
    await controller.submit("save invoice");
    expect(controller.getSnapshot().confirmation).toBeNull();
  });
  it("invalidates a confirmation when the form changes, context changes or it expires", async () => {
    const { controller, update, saveDraft } = setup();
    update({
      contactId: "abc",
      lines: [
        {
          description: "work",
          accountId: "income",
          quantity: "1",
          unitPrice: "20",
          discount: "0",
          taxCodeId: "",
          taxRateBps: "0",
        },
      ],
    });
    await controller.submit("save invoice");
    update({ memo: "edited manually" });
    await controller.confirmSave();
    expect(saveDraft).not.toHaveBeenCalled();
    await controller.submit("save invoice");
    await vi.advanceTimersByTimeAsync(120_001);
    await controller.confirmSave();
    expect(saveDraft).not.toHaveBeenCalled();
    await controller.submit("save invoice");
    controller.setScope("user:other-company", "other-company", permissionsForRole("owner"), true);
    await controller.confirmSave();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(controller.getSnapshot().active).toBe(false);
  });
  it("blocks draft writes without permissions and does not let high-risk commands execute", async () => {
    const { controller, saveDraft, form } = setup();
    controller.setScope("user:company", "company", permissionsForRole("read_only"), true);
    await controller.submit("add services for 1500");
    expect(form().draft.lines).toHaveLength(0);
    for (const command of [
      "post invoice",
      "pay supplier",
      "approve bill",
      "delete invoice",
      "refund 1500",
    ])
      await controller.submit(command);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("does not apply a named document command to a different active editor", async () => {
    const { controller, form, saveDraft } = setup();
    await controller.submit("set bill date to November 15, 2026");
    expect(form().draft.date).toBe("2026-10-31");
    await controller.submit("save bill");
    expect(controller.getSnapshot().confirmation).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("keeps the current action while clarifying ambiguous money and dates", async () => {
    const { controller, form } = setup();
    await controller.submit("add consulting for $1500");
    expect(controller.getSnapshot().phase).toBe("awaiting_clarification");
    expect(form().draft.lines).toHaveLength(0);
    await controller.submit("GBP 1500");
    expect(form().draft.lines[0]?.unitPrice).toBe("1500");
    await controller.submit("set due date to 03/04/2026");
    expect(controller.getSnapshot().phase).toBe("awaiting_clarification");
    await controller.submit("November 15, 2026");
    expect(form().draft.dueDate).toBe("2026-11-15");
  });

  it("clears workflow actions on explicit Stop before a target form loads", async () => {
    const { controller, form } = setup();
    controller.unregister("form");
    await controller.submit("create invoice for ABC Limited");
    controller.stop();
    controller.locationChanged("/sales/invoices/new");
    controller.register(form());
    expect(form().draft.contactId).toBe("");
  });
  it("never retries an uncertain draft save or repeats a submitted confirmation", async () => {
    const { controller, update, saveDraft } = setup();
    update({
      contactId: "abc",
      lines: [
        {
          description: "work",
          accountId: "income",
          quantity: "1",
          unitPrice: "20",
          discount: "0",
          taxCodeId: "",
          taxRateBps: "0",
        },
      ],
    });
    saveDraft.mockRejectedValueOnce(new Error("Network disconnected"));
    await controller.submit("save invoice");
    await controller.confirmSave();
    await controller.submit("save invoice");
    await controller.confirmSave();
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().message).toContain("uncertain");
  });
  it("serialises overlapping commands and ignores duplicate final callbacks", async () => {
    const { controller, navigate } = setup();
    await ready(controller);
    let resolve!: () => void;
    navigate.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const queued = latest().onresult!;
    const event: RecognitionEvent = {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "open invoices" } }],
    };
    queued(event);
    queued(event);
    await controller.submit("open banking");
    expect(navigate).toHaveBeenCalledOnce();
    resolve();
    await vi.advanceTimersByTimeAsync(350);
    expect(controller.getSnapshot().active).toBe(true);
  });
});

describe("registered field editing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Speech.sessions = [];
  });
  afterEach(() => vi.useRealTimers());
  it("targets only the selected field, preserves literal text and reserves action commands", async () => {
    const s = setup();
    s.update({
      lines: [
        {
          description: "",
          accountId: "",
          quantity: "1",
          unitPrice: "0",
          discount: "0",
          taxRateBps: "0",
          taxCodeId: "",
        },
      ],
    });
    const focus = vi.fn();
    s.controller.registerField({
      id: "description",
      token: "form",
      key: "description",
      label: "Description",
      order: 100,
      line: 0,
      focus,
    });
    await s.controller.submit("go to description");
    expect(focus).toHaveBeenCalledOnce();
    await s.controller.submit("Work, Exact CASE.");
    expect(s.form().draft.lines[0]!.description).toBe("Work, Exact CASE.");
    await s.controller.submit("delete invoice");
    expect(s.form().draft.lines[0]!.description).toBe("Work, Exact CASE.");
    await s.controller.submit("dictate Open invoices");
    expect(s.form().draft.lines[0]!.description).toBe("Open invoices");
    expect(s.navigate).not.toHaveBeenCalled();
    s.controller.unregisterField("description");
    await s.controller.submit("Another value");
    expect(s.form().draft.lines[0]!.description).toBe("Open invoices");
    s.controller.dispose();
  });
  it("clarifies matching line fields and cancels targets on route changes", async () => {
    const s = setup(),
      focus = vi.fn();
    for (const line of [0, 1])
      s.controller.registerField({
        id: `desc-${line}`,
        token: "form",
        key: "description",
        label: "Description",
        order: line,
        line,
        focus,
      });
    await s.controller.submit("go to description");
    expect(s.controller.getSnapshot().choices).toHaveLength(2);
    expect(focus).not.toHaveBeenCalled();
    await s.controller.submit("2");
    expect(s.controller.getSnapshot().field?.id).toBe("desc-1");
    s.controller.locationChanged("/contacts");
    expect(s.controller.getSnapshot().field).toBeNull();
    s.controller.dispose();
  });
  it("cannot start recognition after cancellation of an activation handoff", async () => {
    const s = setup();
    let release!: () => void;
    s.controller.setStartGate(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    s.controller.start();
    s.controller.stop();
    release();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(Speech.sessions).toHaveLength(0);
    expect(s.controller.getSnapshot().active).toBe(false);
    s.controller.dispose();
  });
});

it("accepts repeated Next field speech in distinct turns while retaining duplicate-final guards", async () => {
  vi.useFakeTimers();
  Speech.sessions = [];
  const s = setup();
  try {
    for (const [i, key] of ["date", "memo", "number"].entries())
      s.controller.registerField({
        id: key,
        token: "form",
        key: key as "date" | "memo" | "number",
        label: key,
        order: i,
        focus: () => {},
      });
    s.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    latest().result("next field");
    await vi.advanceTimersByTimeAsync(350);
    expect(s.controller.getSnapshot().field?.id).toBe("date");
    latest().result("next field");
    await vi.advanceTimersByTimeAsync(350);
    expect(s.controller.getSnapshot().field?.id).toBe("memo");
  } finally {
    s.controller.dispose();
    vi.useRealTimers();
  }
});

describe("guided bill voice field workflow", () => {
  it("selects a supplier, closes its lookup and focuses the bill date", async () => {
    const { controller, form } = setup();
    const focused: string[] = [];
    form().module = "bill";
    form().permission = "purchases.draft";
    form().contacts = [{ id: "vendor", name: "Northwind Supplies" }];
    for (const [key, label, order] of [
      ["contactId", "Supplier", 10],
      ["date", "Bill date", 20],
      ["paymentTermId", "Payment terms", 25],
      ["dueDate", "Due date", 30],
    ] as const) {
      controller.registerField({
        id: "form:" + key + ":header", token: "form", key, label, order,
        focus: () => focused.push(label),
        close: () => focused.push("closed " + label),
      });
    }
    await controller.submit("choose supplier");
    expect(focused).toContain("Supplier");
    await controller.submit("select supplier Northwind Supplies");
    expect(form().draft.contactId).toBe("vendor");
    expect(focused).toContain("Bill date");
    await controller.submit("next tab");
    expect(focused).toContain("Payment terms");
  });

  it("selects bill payment terms and advances to due date", async () => {
    const { controller, form } = setup();
    const focused: string[] = [];
    form().module = "bill";
    form().permission = "purchases.draft";
    const selectPaymentTerm = vi.fn();
    form().paymentTerms = [{ id: "net30", name: "Net 30" }];
    form().selectPaymentTerm = selectPaymentTerm;
    controller.registerField({
      id: "form:dueDate:header", token: "form", key: "dueDate",
      label: "Due date", order: 30, focus: () => focused.push("Due date"),
    });
    await controller.submit("choose payment terms Net 30");
    expect(selectPaymentTerm).toHaveBeenCalledWith("net30");
    expect(focused).toContain("Due date");
  });
});
