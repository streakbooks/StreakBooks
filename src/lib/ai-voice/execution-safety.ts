import { z } from "zod";

/** Four-level policy for new deterministic commands; legacy tool tiers remain unchanged. */
export const ExecutionRiskTier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type ExecutionRiskTier = z.infer<typeof ExecutionRiskTier>;

export const ExecutionProposal = z.object({
  version: z.literal(1),
  toolName: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  organisationId: z.string().uuid(),
  actorId: z.string().uuid(),
  riskTier: ExecutionRiskTier,
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
  expiresAt: z.number().int().positive(),
}).strict();
export type ExecutionProposal = z.infer<typeof ExecutionProposal>;

export const ConfirmationEvidence = z.object({
  proposalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmedBy: z.string().uuid(),
  confirmedOrganisation: z.string().uuid(),
  confirmedAt: z.number().int().positive(),
  clicked: z.literal(true),
  stepUpVerified: z.boolean(),
}).strict();
export type ConfirmationEvidence = z.infer<typeof ConfirmationEvidence>;

/**
 * Fail-closed guard. Caller must derive actor and organisation from the authenticated
 * server session and independently verify a server-stored proposal digest.
 * A client-supplied confirmation is NEVER sufficient proof of consent.
 */
export function assertExecutionProposal(
  proposalInput: unknown,
  evidenceInput: unknown,
  session: { actorId: string; organisationId: string; now: number; serverVerifiedDigest: string | null },
): void {
  const proposal = ExecutionProposal.parse(proposalInput);
  if (proposal.actorId !== session.actorId || proposal.organisationId !== session.organisationId) {
    throw new Error("Voice proposal does not belong to the signed-in actor and organisation");
  }
  if (!Number.isSafeInteger(session.now) || session.now <= 0) throw new Error("Invalid server clock");
  if (proposal.expiresAt <= session.now) throw new Error("Voice proposal has expired");
  if (proposal.expiresAt - session.now > 300) throw new Error("Voice proposal expiry window exceeds five minutes");
  if (proposal.riskTier === 4) throw new Error("High-risk actions are not available through voice");
  if (proposal.riskTier === 1) return;
  if (!session.serverVerifiedDigest) throw new Error("Server-side confirmation record is required");
  const evidence = ConfirmationEvidence.parse(evidenceInput);
  if (evidence.proposalDigest !== session.serverVerifiedDigest ||
      evidence.confirmedBy !== session.actorId ||
      evidence.confirmedOrganisation !== session.organisationId ||
      evidence.confirmedAt > session.now ||
      session.now - evidence.confirmedAt > 300 ||
      evidence.confirmedAt > proposal.expiresAt) {
    throw new Error("Voice confirmation is invalid or mismatched");
  }
  if (proposal.riskTier === 3 && !evidence.stepUpVerified) {
    throw new Error("Re-authentication is required");
  }
}
