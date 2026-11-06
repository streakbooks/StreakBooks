/** 
 * Fail-closed evidence check for Smart Action Center production releases.
 * Treat a READY Vercel deployment as unverified unless its metadata matches
 * the exact approved repository and source commit.
 * This checks supplied API evidence; it does not fetch deployments or deploy.
 */
export function validateActionCenterDeployment(deployment, approvedSha) {
  const expectedRepo = "linkbusinessadvisory/LinkBooks";
  if (!/^[a-f0-9]{40}$/i.test(approvedSha ?? "")) {
    throw new Error("A complete, approved 40-character main commit SHA is required.");
  }
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("A deployment record from the Vercel API is required.");
  }
  const meta = deployment.meta;
  if (!meta || typeof meta !== "object") {
    throw new Error("Deployment Git metadata is missing.");
  }
  const origin = `${meta.githubOrg ?? ""}/${meta.githubRepo ?? ""}`;
  if (origin !== expectedRepo) {
    throw new Error(`Wrong deployment repository: expected ${expectedRepo}.`);
  }
  if (meta.githubCommitRef !== "main") {
    throw new Error("The deployment must originate from the main branch.");
  }
  if (String(meta.githubCommitSha ?? "").toLowerCase() !== approvedSha.toLowerCase()) {
    throw new Error("The deployment commit does not match the approved main commit.");
  }
  if (deployment.target !== "production") {
    throw new Error("The deployment must target production.");
  }
  if (deployment.state !== "READY") {
    throw new Error("The production deployment is not READY.");
  }
  if (typeof deployment.id !== "string" || !deployment.id.startsWith("dpl_")) {
    throw new Error("A Vercel deployment ID is required for audit evidence.");
  }
  return {
    deploymentId: deployment.id,
    repository: expectedRepo,
    approvedCommit: approvedSha.toLowerCase(),
    branch: "main",
    target: "production",
    state: "READY",
  };
}
