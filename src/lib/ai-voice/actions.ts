import { z } from "zod";
import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";

export const formActionSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("contact.select"), query: z.string().trim().min(1).max(160) }),
  z.object({
    id: z.literal("date.set"),
    field: z.enum(["date", "dueDate"]),
    value: z.string().min(1).max(80),
  }),
  z.object({
    id: z.literal("line.add"),
    description: z.string().max(300),
    amount: z.string().max(80).optional(),
  }),
  z.object({
    id: z.literal("line.amount"),
    amount: z.string().min(1).max(80),
    index: z.number().int().min(0).max(199).optional(),
  }),
  z.object({ id: z.literal("line.remove"), index: z.number().int().min(0).max(199) }),
  z.object({ id: z.literal("account.select"), query: z.string().min(1).max(160) }),
  z.object({ id: z.literal("tax.select"), query: z.string().min(1).max(160) }),
  z.object({
    id: z.literal("field.set"),
    field: z.enum(["currency", "memo", "number", "quantity", "discount"]),
    value: z.string().max(500),
  }),
  z.object({ id: z.literal("draft.save") }),
  z.object({ id: z.literal("contact.previous") }),
]);
export type FormAction = z.infer<typeof formActionSchema>;
export const ACTION_POLICY = {
  "navigation.open": { risk: "low", confirmation: "none" },
  "form.edit": { risk: "medium", confirmation: "none", persistence: "unsaved" },
  "draft.save": { risk: "medium", confirmation: "screen", persistence: "draft" },
  "financial.execute": { risk: "high", confirmation: "existing_manual_workflow", available: false },
} as const;

export function cleanSpeech(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:please |can you |could you |would you )/i, "")
    .replace(/ please$/i, "");
}

export function parseFormAction(input: string): FormAction | null {
  const text = cleanSpeech(input);
  if (text.length > 1000 || /;|\b(?:and then|then)\b/i.test(text)) return null;
  let match: RegExpExecArray | null;
  let action: unknown;
  if (
    /^(?:save|save draft|save (?:the |this )?(?:invoice|bill|quote|credit note)(?: as (?:a )?draft)?)$/i.test(
      text,
    )
  )
    action = { id: "draft.save" };
  else if (/^use (?:the )?previous (?:customer|supplier|vendor)$/i.test(text))
    action = { id: "contact.previous" };
  else if (
    (match =
      /^(?:select|choose|use|find|search for)\s+(?:(?:the )?(?:customer|supplier|vendor)\s+)?(.+)$/i.exec(
        text,
      ))
  )
    action = { id: "contact.select", query: match[1] };
  if (
    (match =
      /^(?:set|change|make) (?:the )?(?:(?:invoice|bill|quote|credit) )?(due date|expiry date|date) (?:to )?(.+)$/i.exec(
        text,
      ))
  )
    action = {
      id: "date.set",
      field: /due|expiry/i.test(match[1]!) ? "dueDate" : "date",
      value: match[2],
    };
  else if ((match = /^add (.+?) for (.+)$/i.exec(text)))
    action = { id: "line.add", description: match[1], amount: match[2] };
  else if (/^add (?:another |a |an )?(?:line|line item|item)$/i.test(text))
    action = { id: "line.add", description: "" };
  else if ((match = /^(?:change|set) (?:that|(?:the )?(?:amount|price)) to (.+)$/i.exec(text)))
    action = { id: "line.amount", amount: match[1] };
  else if ((match = /^(?:change|set) line (\d+) (?:amount|price) to (.+)$/i.exec(text)))
    action = { id: "line.amount", index: Number(match[1]) - 1, amount: match[2] };
  else if (
    (match =
      /^remove (?:the )?(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)? line(?: item)?$/i.exec(
        text,
      ))
  ) {
    const ordinals = ["first", "second", "third", "fourth", "fifth"];
    const ordinal = ordinals.indexOf(match[1]!.toLowerCase());
    action = { id: "line.remove", index: ordinal < 0 ? Number(match[1]) - 1 : ordinal };
  } else if (
    (match = /^(?:use|select|set) (?:the )?(?:revenue |expense )?account(?: to)? (.+)$/i.exec(text))
  )
    action = { id: "account.select", query: match[1] };
  else if ((match = /^(?:use|select|set) (?:the )?tax(?: code)?(?: to)? (.+)$/i.exec(text)))
    action = { id: "tax.select", query: match[1] };
  else if (
    (match =
      /^(?:set|change) (?:the )?(currency|memo|number|invoice number|supplier invoice number|quantity|discount) to (.+)$/i.exec(
        text,
      ))
  )
    action = {
      id: "field.set",
      field: /number/i.test(match[1]!) ? "number" : match[1]!.toLowerCase(),
      value: match[2],
    };
  const result = formActionSchema.safeParse(action);
  return result.success ? result.data : null;
}

/** Strict dates: no locale-dependent numeric guesses or Date.parse rollover. */
export function spokenDate(input: string, today: string, dateFormat?: string): string | null {
  const text = cleanSpeech(input)
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\b(?:the|of)\b/g, " ")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\bsept\b/g, "sep")
    .replace(/\b(?:twenty twenty six)\b/g, "2026")
    .replace(/(\d)(?=[a-z])|([a-z])(?=\d)/g, "$1$2 ")
    .replace(/\s+/g, " ")
    .trim();
  let year: number, month: number, day: number;
  let match: RegExpExecArray | null;
  if (
    /^(today|tomorrow)$/.test(text) ||
    /^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(text)
  ) {
    const date = new Date(`${today}T12:00:00Z`);
    if (!Number.isFinite(date.getTime())) return null;
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const offset =
      text === "today"
        ? 0
        : text === "tomorrow"
          ? 1
          : (weekdays.indexOf(text.slice(5)) - date.getUTCDay() + 7) % 7 || 7;
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }
  if ((match = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(text)))
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(text))) {
    if (dateFormat !== "DD/MM/YYYY" && dateFormat !== "MM/DD/YYYY") return null;
    year = Number(match[3]);
    [day, month] =
      dateFormat === "DD/MM/YYYY"
        ? [Number(match[1]), Number(match[2])]
        : [Number(match[2]), Number(match[1])];
  } else {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    match = /^(?:(\w+) (\d{1,2})|(\d{1,2}) (\w+)) (\d{4})$/.exec(text);
    if (!match) return null;
    year = Number(match[5]);
    const spokenMonth = match[1] ?? match[4] ?? "";
    month = months.findIndex((name) => name === spokenMonth || name.slice(0, 3) === spokenMonth.replace(/\.$/, "")) + 1;
    day = Number(match[2] ?? match[3]);
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

export function spokenMoney(
  input: string,
  currency: string,
): { value: string; currency: string } | { error: string } {
  let text = cleanSpeech(input).toUpperCase();
  const codes: Record<string, string> = {
    POUNDS: "GBP",
    "POUNDS STERLING": "GBP",
    EUROS: "EUR",
    RUPEES: "INR",
    "US DOLLARS": "USD",
  };
  for (const [name, code] of Object.entries(codes).sort((a, b) => b[0].length - a[0].length))
    text = text.replace(new RegExp(`\\b${name}\\b`, "g"), code);
  if (/\$|\bDOLLARS?\b/.test(text))
    return {
      error:
        "Which currency? Say the amount with an explicit currency, such as USD 1500 or CAD 1500.",
    };
  text = text.replace("£", "GBP ").replace("€", "EUR ").replace("₹", "INR ");
  const match = /^(?:([A-Z]{3})\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*([A-Z]{3}))?$/.exec(
    text,
  );
  if (!match || (match[1] && match[3] && match[1] !== match[3]))
    return {
      error:
        "Say a positive decimal amount, for example 1500.00. Negative and ambiguous amounts require manual entry.",
    };
  const code = match[1] ?? match[3] ?? currency;
  if (code !== currency)
    return {
      error: `The form uses ${currency}; that amount is ${code}. Set the form currency explicitly before entering it.`,
    };
  const value = match[2]!.replace(/,/g, "");
  if ((value.split(".")[1]?.length ?? 0) > decimalPlacesFor(code))
    return {
      error: `${code} supports ${decimalPlacesFor(code)} decimal places. Please give an exact amount.`,
    };
  const minor = toMinorUnits(value, code);
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    return { error: "Enter a positive amount within the supported range." };
  return { value, currency: code };
}

export type VoiceOption = { id: string; name: string; rateBps?: number };
export function matchOptions(query: string, options: readonly VoiceOption[]): VoiceOption[] {
  const normal = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const needle = normal(query);
  if (!needle) return [];
  const exact = options.filter((option) => normal(option.name) === needle);
  return exact.length
    ? exact
    : options.filter((option) =>
        needle.split(" ").every((word) =>
          normal(option.name)
            .split(" ")
            .some((part) => part.startsWith(word)),
        ),
      );
}
