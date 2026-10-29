import { describe, expect, it } from "vitest";
import { assertExecutionProposal } from "./execution-safety";

const actorId = "11111111-1111-4111-8111-111111111111";
const organisationId = "22222222-2222-4222-8222-222222222222";
const digest = "a".repeat(64);
const proposal = {
  version: 1 as const, toolName: "create_invoice_draft", organisationId, actorId,
  riskTier: 2 as const, payloadDigest: digest,
  idempotencyKey: "33333333-3333-4333-8333-333333333333", expiresAt: 1200,
};
const session = { actorId, organisationId, now: 1000, serverVerifiedDigest: digest };
const confirmation = {
  proposalDigest: digest, confirmedBy: actorId, confirmedOrganisation: organisationId,
  confirmedAt: 900, clicked: true as const, stepUpVerified: false,
};
describe("four-tier voice proposal safety", () => {
  it("rejects cross-organisation and cross-actor proposals", () => {
    expect(() => assertExecutionProposal({ ...proposal, organisationId: actorId }, confirmation, session)).toThrow(/belong/);
    expect(() => assertExecutionProposal({ ...proposal, actorId: organisationId }, confirmation, session)).toThrow(/belong/);
  });
  it("rejects expired and unsupported high-risk proposals", () => {
    expect(() => assertExecutionProposal({ ...proposal, expiresAt: 999 }, confirmation, session)).toThrow(/expired/);
    expect(() => assertExecutionProposal({ ...proposal, riskTier: 4 }, confirmation, session)).toThrow(/High-risk/);
  });
  it("rejects excessively long expiry and stale confirmations", () => {
    expect(() => assertExecutionProposal({ ...proposal, expiresAt: 1400 }, confirmation, session)).toThrow(/five minutes/);
    expect(() => assertExecutionProposal(proposal, { ...confirmation, confirmedAt: 699 }, session)).toThrow(/mismatched/);
  });
  it("requires server-verified on-screen confirmation", () => {
    expect(() => assertExecutionProposal(proposal, confirmation, { ...session, serverVerifiedDigest: null })).toThrow(/Server-side/);
    expect(() => assertExecutionProposal({ ...proposal, payloadDigest: "b".repeat(64) }, confirmation, session)).toThrow(/proposed payload/);
    expect(() => assertExecutionProposal(proposal, { ...confirmation, proposalDigest: "b".repeat(64) }, session)).toThrow(/mismatched/);
    expect(() => assertExecutionProposal(proposal, confirmation, session)).not.toThrow();
  });
  it("requires step-up verification for tier three", () => {
    expect(() => assertExecutionProposal({ ...proposal, riskTier: 3 }, confirmation, session)).toThrow(/Re-authentication/);
    expect(() => assertExecutionProposal({ ...proposal, riskTier: 3 }, { ...confirmation, stepUpVerified: true }, session)).not.toThrow();
  });
});
