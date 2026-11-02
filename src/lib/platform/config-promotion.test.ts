import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePromotion, requestPromotion } from "./config-promotion";

describe("config promotion", () => {
  it("requires a second person and does not copy in this process", () => {
    const opened = requestPromotion({
      role: "platform_owner",
      sourceId: "company-1",
      targetId: "company-2",
      requesterId: "owner-a",
      reason: "Copy tax",
    });
    expect(opened.copied).toBe(false);
    expect(() =>
      decidePromotion({
        role: "platform_owner",
        request: opened.request,
        approverId: "owner-a",
        decision: "approved",
        reason: "Confirmed",
      }),
    ).toThrow(/second person/);
    const decided = decidePromotion({
      role: "platform_owner",
      request: opened.request,
      approverId: "owner-b",
      decision: "approved",
      reason: "Confirmed",
    });
    expect(decided.copied).toBe(false);
    expect(decided.ledgerCopied).toBe(false);
    expect(decided.presentationFields).toEqual([
      "locale",
      "date_format",
      "invoice_footer",
      "document_theme_color",
    ]);
    expect(decided.request.status).toBe("approved");
  });

  it("copies presentation fields only after the later migration is applied", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102320000_config_promotion.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("copied");
    expect(sql).not.toContain("UPDATE public.companies");
    const copy = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102380000_promotion_presentation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(copy).toContain("READY-TO-APPLY");
    expect(copy).toContain("SET locale = source.locale");
    expect(copy).not.toContain("base_currency");
    expect(copy).not.toContain("journal_lines");
  });
});
