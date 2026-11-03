import { isIP } from "node:net";

/**
 * Explicitly verify that authenticated tests target the intended dedicated staging host.
 * Fail closed when the expected hostname or production comparison is not configured.
 */
function asHttpsUrl(raw, label) {
  if (!raw || typeof raw !== "string") throw new Error(label + " must be configured.");
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(label + " must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") throw new Error(label + " must use HTTPS.");
  if (url.username || url.password) throw new Error(label + " must not contain credentials.");
  if (url.search || url.hash) throw new Error(label + " must not contain query or fragment data.");
  if (url.pathname !== "/" || url.port) {
    throw new Error(label + " must point to the root HTTPS origin without a custom port.");
  }
  return url;
}

export function validateStagingTarget({ stagingUrl, expectedHost, productionUrl }) {
  const stage = asHttpsUrl(stagingUrl, "E2E_BASE_URL");
  const production = asHttpsUrl(productionUrl, "E2E_PRODUCTION_URL");
  if (!expectedHost || typeof expectedHost !== "string") {
    throw new Error("E2E_EXPECTED_STAGING_HOST must be set to the exact staging hostname.");
  }
  const host = expectedHost.trim().toLowerCase();
  if (!host || host.includes("://") || host.includes("/") || host.includes(":")) {
    throw new Error("E2E_EXPECTED_STAGING_HOST must be a hostname, not a URL.");
  }
  if (stage.hostname !== host) {
    throw new Error("Staging URL does not match E2E_EXPECTED_STAGING_HOST.");
  }
  if (stage.hostname === production.hostname || stage.origin === production.origin) {
    throw new Error("Refusing to run authenticated staging tests against the production hostname.");
  }
  if (
    stage.hostname === "localhost" ||
    stage.hostname.endsWith(".localhost") ||
    stage.hostname.endsWith(".local") ||
    stage.hostname.endsWith(".internal") ||
    isIP(stage.hostname.replace(/^\[|\]$/g, "")) !== 0
  ) {
    throw new Error("Staging URL must use a dedicated public staging hostname.");
  }
  return { origin: stage.origin, hostname: stage.hostname };
}
