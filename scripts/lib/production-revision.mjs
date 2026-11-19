import { asHttpsUrl } from "./staging-target.mjs";

export async function verifyProductionRevision({ productionUrl, expectedCommit, request = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
    throw new Error("A full Git commit SHA is required for deployment verification.");
  }
  const origin = asHttpsUrl(productionUrl, "E2E_PRODUCTION_URL");
  const url = new URL("/release-revision.json", origin);
  url.searchParams.set("expected", expectedCommit);

  let response;
  try {
    response = await request(url, {
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("The production revision file could not be reached.");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("The production revision file returned a redirect.");
  }
  if (!response.ok) {
    throw new Error(`The production revision file returned HTTP ${response.status}.`);
  }
  if (
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new Error("The production origin did not return a revision JSON file.");
  }

  const revision = await response.json().catch(() => null);
  if (
    revision?.environment !== "production" ||
    typeof revision.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(revision.commit)
  ) {
    throw new Error("The production revision file did not contain valid build metadata.");
  }
  if (revision.commit !== expectedCommit) {
    throw new Error(`Production reports revision ${revision.commit}, expected ${expectedCommit}.`);
  }
}
