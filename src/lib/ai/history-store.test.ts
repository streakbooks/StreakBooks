import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { saveAiExchange, type AiExchangeToSave } from "./history-store";

const exchange: AiExchangeToSave = {
  companyId: "company-1",
  userId: "user-1",
  intent: "duplicates",
  question: "Check bank duplicates",
  answer: "Two potential duplicates in the sampled transactions.",
  mode: "calculated",
  facts: [{ kind: "duplicates", title: "Duplicates", body: "Two pairs" }],
  suggestionId: null,
  injectionFlagged: false,
};

type FakeDatabaseResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

function clientFor(
  result: FakeDatabaseResult | Error,
  record: (value: unknown, table: string) => void = () => {},
): SupabaseClient<Database> {
  return {
    from: (table: string) => ({
      insert: (row: unknown) => {
        record(row, table);
        return {
          select: () => ({
            single: async () => {
              if (result instanceof Error) throw result;
              return result;
            },
          }),
        };
      },
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("private AI conversation history persistence", () => {
  it("saves one exchange with organisation and user scoping", async () => {
    let captured: unknown;
    let table = "";
    const client = clientFor(
      { data: { id: "entry-1" }, error: null },
      (row, name) => {
        captured = row;
        table = name;
      },
    );
    await expect(saveAiExchange(client, exchange)).resolves.toEqual({
      saved: true,
      historyId: "entry-1",
    });
    expect(table).toBe("ai_conversation_entries");
    expect(captured).toMatchObject({
      company_id: exchange.companyId,
      user_id: exchange.userId,
      question: exchange.question,
      reply_markdown: exchange.answer,
      mode: "calculated",
      injection_flagged: false,
    });
  });

  it("does not discard the answer when history persistence returns a database error", async () => {
    const result = await saveAiExchange(
      clientFor({ data: null, error: { message: "history table not found" } }),
      exchange,
    );
    expect(result).toEqual({ saved: false, historyId: null });
  });

  it("does not leak database exceptions to the caller when saving fails", async () => {
    const result = await saveAiExchange(clientFor(new Error("sensitive database details")), exchange);
    expect(result).toEqual({ saved: false, historyId: null });
  });
});
