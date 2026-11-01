import { fieldMatches, type RegisteredVoiceField } from "./fields";
import type { Permission } from "@/lib/permissions";
import {
  startSpeechCommand,
  recognitionError,
  type RecognitionConstructor,
} from "./browser-recognition";
import {
  canNavigateByVoice,
  parseDeterministicCommand,
  type VoiceDestination,
} from "./deterministic-engine";
import {
  cleanSpeech,
  formActionSchema,
  matchOptions,
  parseFormAction,
  spokenDate,
  spokenMoney,
  type FormAction,
  type VoiceOption,
} from "./actions";
import { describeDraft, type VoiceFormAdapter, type VoiceLine } from "./form-adapter";

export type AssistantPhase =
  | "inactive"
  | "initializing"
  | "listening"
  | "speech_detected"
  | "transcribing"
  | "understanding"
  | "executing"
  | "awaiting_clarification"
  | "awaiting_confirmation"
  | "recovering"
  | "error";
type Confirmation = { token: string; revision: string; expires: number; details: string[] };
export type AssistantSnapshot = {
  available: boolean;
  active: boolean;
  phase: AssistantPhase;
  message: string;
  heard: string;
  choices: VoiceOption[];
  confirmation: Confirmation | null;
  form: string | null;
  field: { id: string; label: string } | null;
};
type Dependencies = {
  recognition(): RecognitionConstructor | undefined;
  navigate(destination: VoiceDestination): Promise<void>;
  back(): void;
};

/** Session-scoped state machine. No audio, transcripts or draft data are persisted. */
export class AssistantController {
  private snapshot: AssistantSnapshot = {
    available: false,
    active: false,
    phase: "inactive",
    message: "Start Signal when you’re ready.",
    heard: "",
    choices: [],
    confirmation: null,
    form: null,
    field: null,
  };
  private listeners = new Set<() => void>();
  private forms = new Map<string, VoiceFormAdapter>();
  private fields = new Map<string, RegisteredVoiceField>();
  private permissions: readonly Permission[] = [];
  private scope = "";
  private companyId = "";
  private permitted = false;
  private generation = 0;
  private turn = 0;
  private cancelMic: (() => void) | null = null;
  private restart: ReturnType<typeof setTimeout> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private failureCount = 0;
  private foreground = true;
  private online = true;
  private inFlight = false;
  private lastLine: { token: string; index: number } | null = null;
  private location = "";
  private pendingContact: {
    module: string;
    query: string;
    destination: string;
    fromToken: string | undefined;
  } | null = null;
  private previousContact: string | null = null;
  private lastContact: string | null = null;
  private lastRecord: { destination: string; module: string } | null = null;
  private savedRevisions = new Set<string>();
  private uncertainForms = new Set<string>();
  private clarification: {
    token: string;
    revision: string;
    apply(id: string): Promise<void>;
  } | null = null;

  constructor(private deps: Dependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<AssistantSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private get form(): VoiceFormAdapter | undefined {
    return [...this.forms.values()].filter((form) => form.companyId === this.companyId).at(-1);
  }

  registerField(field: RegisteredVoiceField) {
    this.fields.set(field.id, field);
  }
  unregisterField(id: string) {
    this.fields.delete(id);
    if (this.snapshot.field?.id === id) this.clearField();
  }
  clearField() {
    this.fields.get(this.snapshot.field?.id ?? "")?.close?.();
    if (this.snapshot.field) this.set({ field: null });
  }
  fieldFocused(id: string) {
    const field = this.fields.get(id);
    if (field?.token !== this.form?.token || !field) return;
    if (this.snapshot.field?.id !== id) {
      this.fields.get(this.snapshot.field?.id ?? "")?.close?.();
      this.clearPending();
      this.set({
        field: {
          id,
          label: field.line === undefined ? field.label : `Line ${field.line + 1} ${field.label}`,
        },
      });
    }
  }
  private focusField(query: string) {
    const form = this.getEditable();
    const fields = [...this.fields.values()]
      .filter((f) => f.token === form.token)
      .sort((a, b) => a.order - b.order);
    const index = fields.findIndex((f) => f.id === this.snapshot.field?.id);
    const matches =
      query === "next" || query === "previous"
        ? [
            fields[
              index < 0
                ? query === "next"
                  ? 0
                  : fields.length - 1
                : index + (query === "next" ? 1 : -1)
            ],
          ].filter((f): f is RegisteredVoiceField => !!f)
        : fields.filter((f) => fieldMatches(query, f));
    if (!matches.length)
      throw new Error(
        "That editable field is not available here. Choose a visible field or use Next field / Previous field.",
      );
    const focus = (id: string) => {
      const field = this.fields.get(id);
      if (!field || field.token !== this.form?.token)
        throw new Error("That field is no longer available.");
      this.fieldFocused(id);
      field.focus();
      this.set({
        message: `${this.snapshot.field?.label} selected. Say its value, or say “dictate” followed by literal text. Values replace the field; nothing is saved.`,
      });
    };
    if (matches.length === 1) focus(matches[0]!.id);
    else {
      this.clarification = {
        token: form.token,
        revision: form.revision,
        apply: async (id) => focus(id),
      };
      this.set({
        choices: matches.map((f) => ({ id: f.id, name: `Line ${(f.line ?? 0) + 1} ${f.label}` })),
        message: "Which line’s field? Say its number or choose a result.",
        phase: "awaiting_clarification",
      });
    }
  }
  private async dictateField(value: string, clear = false) {
    const form = this.getEditable();
    const field = this.fields.get(this.snapshot.field?.id ?? "");
    if (!field || field.token !== form.token)
      throw new Error("Select a field first. Say “go to description” or “next field”.");
    const { key, line } = field;
    if (key === "contactId" || key === "accountId" || key === "taxCodeId") {
      if (clear) throw new Error("Use the field’s normal clear control for record selections.");
      const options =
        key === "contactId" ? form.contacts : key === "accountId" ? form.accounts : form.taxes;
      this.choose(form, value, options, (id) => {
        if (key === "contactId") form.selectContact(id);
        else {
          if (line === undefined || !form.draft.lines[line])
            throw new Error("Select a line first.");
          form.updateLines(
            form.draft.lines.map((l, i) =>
              i === line
                ? {
                    ...l,
                    [key]: id,
                    ...(key === "taxCodeId"
                      ? { taxRateBps: String(form.taxes.find((t) => t.id === id)?.rateBps ?? 0) }
                      : {}),
                  }
                : l,
            ),
          );
        }
        field.close?.();
      });
      return;
    }
    let parsed = clear ? "" : value;
    if (!clear && (key === "date" || key === "dueDate")) {
      const date = spokenDate(value, form.today, form.dateFormat);
      if (!date)
        throw new Error(
          `Give a valid full date. Numeric dates use ${form.dateFormat ?? "the company date format"}.`,
        );
      if (key === "dueDate" && date < form.draft.date)
        throw new Error("Due date cannot be before the document date.");
      parsed = date;
    }
    if (!clear && (key === "unitPrice" || key === "discount")) {
      const amount =
        value === "0" && key === "discount"
          ? { value: "0" }
          : spokenMoney(value, form.draft.currency);
      if ("error" in amount) throw new Error(amount.error);
      parsed = amount.value;
    }
    if (
      !clear &&
      key === "quantity" &&
      (!/^\d+(?:\.\d{1,6})?$/.test(value) || !(Number(value) > 0))
    )
      throw new Error("Give a positive numeric quantity.");
    if (key === "currency") {
      if (clear) throw new Error("Choose an enabled currency.");
      await this.executeForm({ id: "field.set", field: "currency", value });
      return;
    }
    if (line !== undefined) {
      if (!form.draft.lines[line]) throw new Error("That line changed. Select the field again.");
      form.updateLines(form.draft.lines.map((l, i) => (i === line ? { ...l, [key]: parsed } : l)));
      this.lastLine = { token: form.token, index: line };
    } else form.update({ [key]: parsed });
    this.set({
      message: `${field.label} ${clear ? "cleared" : "updated"}. Continue dictating to this field or choose the next field. Nothing saved.`,
    });
  }

  setScope(scope: string, companyId: string, permissions: readonly Permission[], enabled: boolean) {
    const permitted = enabled && permissions.includes("company.view");
    if (
      scope !== this.scope ||
      permitted !== this.permitted ||
      JSON.stringify(permissions) !== JSON.stringify(this.permissions)
    ) {
      this.stop(
        this.scope
          ? "Voice session ended because your account, organisation, permissions or feature access changed."
          : "Start Signal when you’re ready.",
      );
      for (const [token, form] of this.forms)
        if (form.companyId !== companyId) this.forms.delete(token);
      this.previousContact = this.lastContact = null;
      this.lastRecord = null;
      this.lastLine = null;
      if (scope !== this.scope) {
        this.savedRevisions.clear();
        this.uncertainForms.clear();
      }
      this.pendingContact = null;
    }
    this.scope = scope;
    this.companyId = companyId;
    this.permissions = permissions;
    this.permitted = permitted;
    this.set({ available: permitted, form: this.form?.module ?? null });
  }

  register(form: VoiceFormAdapter) {
    this.forms.set(form.token, form);
    const pending = this.snapshot.confirmation;
    if (pending?.token === form.token && pending.revision !== form.revision && !this.inFlight)
      this.clearPending("The form changed. Ask to save again to review the updated draft.");
    if (this.clarification?.token === form.token && this.clarification.revision !== form.revision)
      this.clearPending("The form changed. Please repeat your command.");
    this.applyPendingContact();
    if (this.snapshot.form !== this.form?.module) this.set({ form: this.form?.module ?? null });
  }
  private applyPendingContact() {
    const pending = this.pendingContact,
      form = this.form;
    if (
      !pending ||
      !form ||
      !form.ready ||
      form.busy ||
      form.token === pending.fromToken ||
      form.module !== pending.module ||
      this.location !== pending.destination
    )
      return;
    this.pendingContact = null;
    if (!this.permissions.includes(form.permission)) return;
    try {
      this.choose(form, pending.query, form.contacts, (id) => {
        this.previousContact = this.lastContact;
        this.lastContact = id;
        form.selectContact(id);
      });
    } catch (cause) {
      this.set({
        message: cause instanceof Error ? cause.message : "Choose a contact in the form.",
      });
    }
  }
  unregister(token: string) {
    if (!this.forms.has(token)) return;
    this.forms.delete(token);
    if (this.fields.get(this.snapshot.field?.id ?? "")?.token === token) this.clearField();
    if (this.snapshot.confirmation?.token === token || this.clarification?.token === token)
      this.clearPending("The form closed. That pending action was cancelled.");
    if (this.lastLine?.token === token) this.lastLine = null;
    this.set({ form: this.form?.module ?? null });
  }
  locationChanged(location?: string) {
    this.clearField();
    this.clearPending();
    this.lastLine = null;
    if (location !== undefined) {
      this.location = location.split(/[?#]/)[0]!;
      if (this.pendingContact && this.pendingContact.destination !== this.location)
        this.pendingContact = null;
    }
    this.applyPendingContact();
  }
  private clearPending(message?: string) {
    this.clarification = null;
    clearTimeout(this.expiry);
    this.set({
      confirmation: null,
      choices: [],
      ...(["awaiting_confirmation", "awaiting_clarification"].includes(this.snapshot.phase)
        ? { phase: this.snapshot.active ? ("listening" as const) : ("inactive" as const) }
        : {}),
      ...(message ? { message } : {}),
    });
  }
  private startGate: (() => Promise<void>) | null = null;
  private starting = false;
  setStartGate(gate: (() => Promise<void>) | null) {
    this.startGate = gate;
  }
  start() {
    if (this.startGate) {
      if (this.starting || this.snapshot.active || !this.permitted) return;
      this.starting = true;
      const generation = this.generation;
      void this.startGate()
        .then(() => {
          if (generation === this.generation) this.beginStart();
        })
        .catch(() => {
          this.set({
            phase: "error",
            message: "Could not release wake detection. Stop all microphones and try again.",
          });
        })
        .finally(() => {
          this.starting = false;
        });
    } else this.beginStart();
  }
  recognitionSupported() {
    return Boolean(this.deps.recognition());
  }
  private beginStart() {
    if (this.snapshot.active || !this.permitted) return;
    if (this.inFlight) {
      this.set({
        message:
          "The previous action is still finishing. Wait for it before starting Signal again.",
      });
      return;
    }
    if (!this.recognitionSupported()) {
      this.set({
        phase: "error",
        message:
          "Speech recognition is not supported in this browser. Use text commands or normal controls.",
      });
      return;
    }
    this.failureCount = 0;
    this.set({ active: true, phase: "initializing", message: "Connecting the microphone…" });
    this.listen(0);
  }
  stop(message = "Signal is off. Microphone released.") {
    this.clearField();
    this.generation++;
    this.turn++;
    clearTimeout(this.restart);
    clearTimeout(this.expiry);
    this.cancelMic?.();
    this.cancelMic = null;
    this.clarification = null;
    this.pendingContact = null;
    this.set({
      active: false,
      phase: "inactive",
      message,
      heard: "",
      choices: [],
      confirmation: null,
    });
  }
  dispose() {
    this.stop();
    this.forms.clear();
  }
  environment(foreground: boolean, online: boolean) {
    this.foreground = foreground;
    this.online = online;
    if (!this.snapshot.active) return;
    if (!foreground || !online) {
      clearTimeout(this.restart);
      this.turn++;
      this.cancelMic?.();
      this.cancelMic = null;
      this.set({
        phase: "recovering",
        message: !foreground
          ? "Signal is paused while the page is hidden. It resumes when you return."
          : "Waiting for internet access. Signal will reconnect when you’re online.",
      });
    } else if (!this.cancelMic && !this.inFlight) this.listen(300);
  }
  permissionDenied() {
    this.stop(recognitionError("not-allowed"));
    this.set({ phase: "error" });
  }
  private listen(delay = 300) {
    clearTimeout(this.restart);
    if (!this.snapshot.active || !this.foreground || !this.online || this.inFlight) return;
    this.restart = setTimeout(() => {
      if (!this.snapshot.active || this.inFlight) return;
      this.cancelMic?.();
      const Constructor = this.deps.recognition();
      if (!Constructor) {
        this.stop("Speech recognition became unavailable. Use the text command field.");
        this.set({ phase: "error" });
        return;
      }
      const generation = this.generation,
        turn = ++this.turn;
      const turnStartedAt = Date.now();
      const current = () =>
        generation === this.generation && turn === this.turn && this.snapshot.active;
      this.cancelMic = startSpeechCommand(Constructor, {
        onListening: () => {
          if (current())
            this.set({
              phase: this.snapshot.confirmation
                ? "awaiting_confirmation"
                : this.clarification
                  ? "awaiting_clarification"
                  : "listening",
              ...(!this.snapshot.confirmation &&
              !this.clarification &&
              (this.snapshot.phase === "initializing" || this.failureCount > 0)
                ? {
                    message:
                      "Listening. Continue with your next command; Signal stays active until you stop.",
                  }
                : {}),
            });
        },
        onSpeech: () => {
          if (current() && !this.snapshot.confirmation && !this.clarification)
            this.set({ phase: "speech_detected" });
        },
        onTranscribing: () => {
          if (current() && !this.snapshot.confirmation && !this.clarification)
            this.set({ phase: "transcribing" });
        },
        onTranscript: (text) => {
          if (!current()) return;
          this.cancelMic = null;
          this.failureCount = 0;
          // The adapter and turn identity reject duplicate finals within a turn.
          // Identical text in a new turn can be intentional (e.g. repeated Next field).
          void this.submit(text);
        },
        onMessage: () => {},
        onBoundary: (reason) => {
          if (!current()) return;
          this.cancelMic = null;
          if (
            ["not-allowed", "service-not-allowed", "NotAllowedError", "SecurityError"].includes(
              reason,
            )
          ) {
            this.permissionDenied();
            return;
          }
          if (
            ["audio-capture", "language-not-supported", "unknown", "NotSupportedError"].includes(
              reason,
            )
          ) {
            this.stop(recognitionError(reason));
            this.set({ phase: "error" });
            return;
          }
          if (!["end", "timeout", "no-speech"].includes(reason)) this.failureCount++;
          if (reason === "end" && Date.now() - turnStartedAt < 500) this.failureCount++;
          if (this.failureCount >= 5) {
            this.stop(
              "Speech recognition repeatedly failed. Check your connection and microphone, then start Signal again.",
            );
            this.set({ phase: "error" });
            return;
          }
          this.set({
            phase: "recovering",
            ...(["end", "timeout", "no-speech"].includes(reason)
              ? {}
              : { message: recognitionError(reason) }),
          });
          this.listen(Math.min(8000, reason === "network" ? 1000 * 2 ** this.failureCount : 600));
        },
      });
    }, delay);
  }

  async submit(input: string) {
    if (!this.permitted || this.inFlight) return;
    const text = cleanSpeech(input);
    if (!text || text.length > 1000) return;
    if (/^(?:stop(?: listening)?|deactivate(?: signal)?|turn (?:signal|voice) off)$/i.test(text)) {
      this.stop();
      return;
    }
    this.cancelMic?.();
    this.cancelMic = null;
    clearTimeout(this.restart);
    this.turn++;
    const generation = this.generation;
    this.inFlight = true;
    this.set({ phase: "understanding", heard: text });
    try {
      if (/^(?:yes|confirm|confirm save)$/i.test(text) && this.snapshot.confirmation) {
        this.set({
          phase: "awaiting_confirmation",
          message:
            "Review the draft and use Confirm save on screen. Spoken confirmation does not save it.",
        });
        return;
      }
      if (
        /^(?:cancel|cancel (?:this |the )?(?:invoice|bill|quote|draft)|never mind|discard command)$/i.test(
          text,
        )
      ) {
        this.clearPending("Pending action cancelled. Your unsaved form is unchanged.");
        return;
      }
      const focusQuery = /^(?:go to|focus(?: on)?|select field|select the field|enter|click on) (.+?)(?: field)?$/i.exec(text)?.[1];
      const direction = /^(?:(?:go to|move to|focus on|select) (?:the )?)?(next|previous) (?:field|input)$/i.exec(text)?.[1]?.toLowerCase();
      if (
        direction ||
        (focusQuery &&
          this.form &&
          [...this.fields.values()].some(
            (f) => f.token === this.form?.token && fieldMatches(focusQuery, f),
          ))
      ) {
        this.clearPending();
        this.focusField(direction ?? focusQuery!);
        return;
      }
      if (/^clear (?:this|the current) field$/i.test(text)) {
        this.clearPending();
        await this.dictateField("", true);
        return;
      }
      if (/^(?:dictate|input text|enter text|type text|input value|enter value|type value|fill in) /i.test(text)) {
        this.clearPending();
        await this.dictateField(input.trim().replace(/^(?:dictate|input text|enter text|type text|input value|enter value|type value|fill in)\\s+/i, ""));
        return;
      }
      if (this.clarification) {
        const pending = this.clarification,
          form = this.form;
        if (!form || form.token !== pending.token || form.revision !== pending.revision) {
          this.clearPending("That form changed. Please repeat your command.");
          return;
        }
        const choice = /^\d+$/.test(text)
          ? this.snapshot.choices[Number(text) - 1]
          : matchOptions(text, this.snapshot.choices).length === 1
            ? matchOptions(text, this.snapshot.choices)[0]
            : undefined;
        if (choice) {
          this.clearPending();
          await pending.apply(choice.id);
          return;
        }
        if (
          !this.snapshot.choices.length &&
          !parseFormAction(text) &&
          parseDeterministicCommand(text, this.location).kind === "unsupported"
        ) {
          this.clearPending();
          await pending.apply(text);
          return;
        }
        // New explicit commands can replace a clarification instead of trapping the user.
      }
      const startFor =
        /^(?:create|prepare|start) (?:a |an )?(?:new )?(invoice|bill|quote) for (.+)$/i.exec(text);
      const navigationText = startFor ? `create ${startFor[1]}` : text;
      const navigation = parseDeterministicCommand(
        navigationText
          .replace(/^(create|open) (?:a )?new /i, "$1 ")
          .replace(/^create (?:a|an) /i, "create "),
        this.location,
      );
      if (navigation.kind === "matched") {
        this.clearPending();
        if (!canNavigateByVoice(navigation.command, this.permissions)) {
          this.set({ message: "You do not have permission to open that page or form." });
          return;
        }
        this.pendingContact = startFor
          ? {
              module: startFor[1]!.toLowerCase(),
              query: startFor[2]!,
              destination: navigation.command.destination,
              fromToken: this.form?.token,
            }
          : null;
        this.inFlight = true;
        this.set({ phase: "executing" });
        await this.deps.navigate(navigation.command.destination);
        if (generation === this.generation && !startFor)
          this.set({
            message: `${navigation.command.label} opened. Continue with your next command.`,
          });
        return;
      }
      if (/^(?:go back|back)$/i.test(text)) {
        this.clearPending();
        this.deps.back();
        this.set({ message: "Going back. Signal stays active." });
        return;
      }
      if (
        /^show (?:me )?(?:the |my )?(?:invoice|bill|quote)(?: again)?$/i.test(text) &&
        this.lastRecord
      ) {
        const requested = /\b(invoice|bill|quote)\b/i.exec(text)?.[1]?.toLowerCase();
        if (requested !== this.lastRecord.module)
          throw new Error(
            `The last saved draft was a ${this.lastRecord.module}. Open the relevant list to choose another record.`,
          );
        await this.deps.navigate(this.lastRecord.destination as VoiceDestination);
        this.set({ message: "The saved draft is open." });
        return;
      }
      const action = parseFormAction(text);
      if (!action) {
        if (
          this.snapshot.field &&
          !/^(?:pay|post|approve|authori[sz]e|send|refund|delete|void|submit|open|create|go to|set|change|save|next|previous|enter|focus)\b/i.test(
            text,
          )
        ) {
          this.clearPending();
          await this.dictateField(input.trim());
          return;
        }
        this.set({
          message: /^(?:pay|post|approve|authori[sz]e|send|refund|delete|void|submit)/i.test(text)
            ? "Use this record’s normal review and confirmation controls for posting, sending, payments, refunds or deletion. Signal cannot execute those actions."
            : "I couldn’t match that command. Try “open invoices”, “select customer ABC”, “set due date to November 15, 2026”, or “save invoice”.",
        });
        return;
      }
      this.clearPending();
      if (action.id === "draft.save" || action.id === "date.set") {
        const requested =
          /^(?:save|set|change|make) (?:the |this )?(?:draft )?(invoice|bill|quote|credit note)\b/i
            .exec(text)?.[1]
            ?.toLowerCase()
            .replace(" ", "_");
        if (requested && this.form && requested !== this.form.module)
          throw new Error(
            `The current form is a ${this.form.module.replace("_", " ")}. Please name this document or open the intended form.`,
          );
      }
      await this.executeForm(action);
    } catch (cause) {
      this.pendingContact = null;
      if (generation === this.generation)
        this.set({
          message:
            cause instanceof Error
              ? cause.message
              : "The action could not complete. Please check the form.",
        });
    } finally {
      this.inFlight = false;
      if (generation === this.generation) {
        this.applyPendingContact();
        this.set({
          phase: this.snapshot.confirmation
            ? "awaiting_confirmation"
            : this.clarification
              ? "awaiting_clarification"
              : this.snapshot.active
                ? "recovering"
                : "inactive",
        });
        this.listen();
      }
    }
  }

  private getEditable(): VoiceFormAdapter {
    const form = this.form;
    if (!form || form.companyId !== this.companyId)
      throw new Error(
        "Open an invoice, quote, sales credit note or bill form first. This screen has no registered editing actions.",
      );
    if (!form.ready || form.busy)
      throw new Error("The form is still loading or saving. Please wait before continuing.");
    if (!this.permissions.includes(form.permission))
      throw new Error("You do not have permission to edit this document.");
    return form;
  }
  private choose(
    form: VoiceFormAdapter,
    query: string,
    options: VoiceOption[],
    apply: (id: string) => void,
  ) {
    const matches = matchOptions(query, options);
    if (!matches.length)
      throw new Error(
        "No matching record is loaded in this form. Use its search control to find the record; Signal will not invent one.",
      );
    if (matches.length === 1) {
      apply(matches[0]!.id);
      this.set({ message: `Selected ${matches[0]!.name}.` });
      return;
    }
    const choices = matches.slice(0, 8);
    this.clarification = {
      token: form.token,
      revision: form.revision,
      apply: async (id) => {
        if (!this.permissions.includes(form.permission)) throw new Error("Permission changed.");
        apply(id);
        this.set({ message: `Selected ${choices.find((c) => c.id === id)?.name}.` });
      },
    };
    this.set({
      phase: "awaiting_clarification",
      message:
        matches.length > 8
          ? "Several records match. Be more specific, or choose from these results."
          : "Which record did you mean? Say its full name or choose a numbered result.",
      choices,
    });
  }
  private askForValue(
    form: VoiceFormAdapter,
    message: string,
    apply: (value: string) => Promise<void>,
  ) {
    this.clarification = { token: form.token, revision: form.revision, apply };
    this.set({ phase: "awaiting_clarification", choices: [], message });
  }
  async chooseOption(id: string) {
    const pending = this.clarification,
      form = this.form;
    if (
      !pending ||
      !form ||
      pending.token !== form.token ||
      pending.revision !== form.revision ||
      !this.snapshot.choices.some((c) => c.id === id)
    )
      return;
    this.clearPending();
    try {
      await pending.apply(id);
    } catch (cause) {
      this.set({ message: cause instanceof Error ? cause.message : "Selection failed." });
    }
    this.set({ phase: this.snapshot.active ? "listening" : "inactive" });
  }
  private async executeForm(input: FormAction) {
    const action = formActionSchema.parse(input),
      form = this.getEditable();
    const draft = form.draft;
    const lineIndex =
      this.lastLine?.token === form.token ? this.lastLine.index : draft.lines.length === 1 ? 0 : -1;
    const updateLine = (patch: Partial<VoiceLine>, index = lineIndex) => {
      if (index < 0 || !draft.lines[index])
        throw new Error(
          "Which line? Say “set line 2 amount to 1800” or select a line by adding it first.",
        );
      form.updateLines(draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
      this.lastLine = { token: form.token, index };
    };
    if (action.id === "contact.select") {
      this.choose(form, action.query, form.contacts, (id) => {
        this.previousContact = draft.contactId || this.lastContact;
        this.lastContact = id;
        form.selectContact(id);
      });
      return;
    }
    if (action.id === "contact.previous") {
      const id = this.previousContact ?? this.lastContact;
      if (!id || !form.contacts.some((c) => c.id === id))
        throw new Error("No previous matching contact is available in this organisation.");
      form.selectContact(id);
      this.set({ message: "Previous contact selected." });
      return;
    }
    if (action.id === "date.set") {
      const date = spokenDate(action.value, form.today, form.dateFormat);
      if (!date) {
        this.askForValue(
          form,
          "Which date? Use the company’s configured numeric date format, a full month name and year, YYYY-MM-DD, today or tomorrow.",
          (value) => this.executeForm({ ...action, value }),
        );
        return;
      }
      if (action.field === "dueDate" && date < draft.date)
        throw new Error("Due date cannot be before the document date.");
      form.update({ [action.field]: date });
      this.set({
        message: `${action.field === "dueDate" ? "Due/expiry date" : "Document date"} set to ${date}.`,
      });
      return;
    }
    if (action.id === "line.add" || action.id === "line.amount") {
      const amount = action.amount ? spokenMoney(action.amount, draft.currency) : null;
      if (amount && "error" in amount) {
        this.askForValue(form, amount.error, (value) =>
          this.executeForm({ ...action, amount: value }),
        );
        return;
      }
      if (action.id === "line.add") {
        const line: VoiceLine = {
          description: action.description,
          quantity: "1",
          accountId: "",
          unitPrice: amount?.value ?? "0.00",
          discount: "0",
          taxCodeId: "",
          taxRateBps: "0",
        };
        const empty = draft.lines.findIndex(
          (l) => !l.description && !l.accountId && Number(l.unitPrice) === 0,
        );
        const index = empty < 0 ? draft.lines.length : empty;
        form.updateLines(
          empty < 0 ? [...draft.lines, line] : draft.lines.map((l, i) => (i === index ? line : l)),
        );
        this.lastLine = { token: form.token, index };
        this.set({
          message: `Line ${index + 1} added${amount ? ` at ${draft.currency} ${amount.value}` : ""}. Choose its account and review tax in the form.`,
        });
      } else {
        updateLine({ unitPrice: amount!.value }, action.index ?? lineIndex);
        this.set({ message: `Line amount changed to ${draft.currency} ${amount!.value}.` });
      }
      return;
    }
    if (action.id === "line.remove") {
      if (!draft.lines[action.index]) throw new Error("That line does not exist.");
      form.updateLines(draft.lines.filter((_, i) => i !== action.index));
      this.lastLine = null;
      this.set({ message: `Unsaved line ${action.index + 1} removed.` });
      return;
    }
    if (action.id === "account.select" || action.id === "tax.select") {
      this.choose(
        form,
        action.query,
        action.id === "account.select" ? form.accounts : form.taxes,
        (id) =>
          updateLine(
            action.id === "account.select"
              ? { accountId: id }
              : {
                  taxCodeId: id,
                  taxRateBps: String(form.taxes.find((tax) => tax.id === id)?.rateBps ?? 0),
                },
          ),
      );
      return;
    }
    if (action.id === "field.set") {
      if (action.field === "currency") {
        const value = action.value.toUpperCase();
        if (!form.currencies.includes(value))
          throw new Error("Choose an enabled three-letter currency code from the form.");
        if (draft.lines.some((line) => Number(line.unitPrice) !== 0))
          throw new Error(
            "Changing currency with existing amounts requires manual review in the form.",
          );
        form.update({ currency: value });
      } else if (action.field === "quantity") {
        if (!/^\d+(?:\.\d{1,6})?$/.test(action.value) || !(Number(action.value) > 0))
          throw new Error("Give a positive numeric quantity.");
        updateLine({ quantity: action.value });
      } else if (action.field === "discount") {
        if (action.value === "0") updateLine({ discount: "0" });
        else {
          const amount = spokenMoney(action.value, draft.currency);
          if ("error" in amount) throw new Error(amount.error);
          updateLine({ discount: amount.value });
        }
      } else form.update({ [action.field]: action.value });
      this.set({ message: `${action.field} updated in the unsaved form.` });
      return;
    }
    if (action.id === "draft.save") {
      if (this.uncertainForms.has(form.token))
        throw new Error(
          "The previous save outcome is uncertain. Check the document list before saving again. Signal will not retry a possible creation.",
        );
      if (this.savedRevisions.has(`${form.token}:${form.revision}`))
        throw new Error("This version was already saved. No duplicate save was sent.");
      const errors = form.validate();
      if (errors.length) throw new Error(errors.join(" "));
      const confirmation = {
        token: form.token,
        revision: form.revision,
        expires: Date.now() + 120_000,
        details: describeDraft(form),
      };
      this.set({
        phase: "awaiting_confirmation",
        confirmation,
        message: "Review the draft details, then choose Confirm save. Nothing has been saved yet.",
      });
      this.expiry = setTimeout(
        () =>
          this.clearPending(
            "Save confirmation expired. Ask to save again after reviewing the form.",
          ),
        120_000,
      );
    }
  }

  async confirmSave() {
    if (this.inFlight) return;
    const pending = this.snapshot.confirmation;
    if (!pending) return;
    const form = this.getEditable();
    if (
      pending.token !== form.token ||
      pending.revision !== form.revision ||
      Date.now() >= pending.expires
    ) {
      this.clearPending("The draft or confirmation changed. Ask to save again.");
      return;
    }
    const errors = form.validate();
    if (errors.length) {
      this.clearPending(errors.join(" "));
      return;
    }
    const key = `${form.token}:${form.revision}`;
    if (this.savedRevisions.has(key) || this.uncertainForms.has(form.token)) {
      this.clearPending("This save has already been submitted. Check the record before retrying.");
      return;
    }
    this.clearPending();
    this.cancelMic?.();
    this.cancelMic = null;
    clearTimeout(this.restart);
    this.turn++;
    this.inFlight = true;
    this.set({ phase: "executing", message: "Saving draft through the existing form…" });
    const generation = this.generation;
    try {
      const result = await form.saveDraft();
      if (generation !== this.generation) return;
      this.savedRevisions.add(key);
      const parent =
        form.module === "bill"
          ? "/purchases/bills"
          : form.module === "quote"
            ? "/sales/quotes"
            : form.module === "credit_note"
              ? "/sales/credit-notes"
              : "/sales/invoices";
      this.lastRecord = {
        destination: `${parent}/${encodeURIComponent(result.id)}`,
        module: form.module,
      };
      this.set({
        message:
          result.warning ??
          `Draft ${form.module.replace("_", " ")} saved. You can continue with another command.`,
      });
    } catch (cause) {
      if (generation === this.generation) this.uncertainForms.add(form.token); // No automatic retries.
      if (generation === this.generation)
        this.set({
          message: `Save did not confirm success: ${cause instanceof Error ? cause.message : "unknown error"}. Check the draft list before retrying; no automatic retry will be sent.`,
        });
    } finally {
      this.inFlight = false;
      if (generation === this.generation) {
        this.set({ phase: this.snapshot.active ? "recovering" : "inactive" });
        this.listen();
      }
    }
  }
}
