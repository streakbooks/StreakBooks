/**
 * Azure Document Intelligence REST v4.0 invoice OCR.
 * Runs only in trusted server functions; the API key and raw document bytes
 * must never be returned to the browser.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseAzureInvoiceSuggestions } from "@/lib/documents/ocr-model";

const VERSION = "2024-11-30";
const MODEL = "prebuilt-invoice";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_TTL_MS = 45 * 60 * 1000;

export type OcrConfig =
  | { configured: false; missing: string[] }
  | { configured: true; endpoint: string; apiKey: string; signingKey: string };

function providerEndpoint(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")
    ) return null;
    if (!/^[a-z0-9-]+\.cognitiveservices\.azure\.com$/.test(url.hostname))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readOcrConfig(
  env: Record<string, string | undefined> = process.env,
): OcrConfig {
  const endpoint = providerEndpoint(env["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"] ?? "");
  const apiKey = (env["AZURE_DOCUMENT_INTELLIGENCE_KEY"] ?? "").trim();
  const signingKey = (env["DOCUMENT_OCR_JOB_SIGNING_KEY"] ?? "").trim();
  const missing = [
    ...(endpoint ? [] : ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"]),
    ...(apiKey ? [] : ["AZURE_DOCUMENT_INTELLIGENCE_KEY"]),
    ...(signingKey.length >= 32 ? [] : ["DOCUMENT_OCR_JOB_SIGNING_KEY (min 32 characters)"]),
  ];
  return missing.length ? { configured: false, missing } : {
    configured: true, endpoint: endpoint!, apiKey, signingKey,
  };
}

function analyzeUrl(config: Extract<OcrConfig, { configured: true }>): string {
  return `${config.endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${VERSION}&pages=1-3`;
}
function resultUrl(config: Extract<OcrConfig, { configured: true }>, resultId: string): string {
  if (!UUID.test(resultId)) throw new Error("Invalid extraction identifier.");
  return `${config.endpoint}/documentintelligence/documentModels/${MODEL}/analyzeResults/${resultId}?api-version=${VERSION}`;
}

export async function submitAzureInvoiceOcr(
  config: Extract<OcrConfig, { configured: true }>,
  fileBytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(analyzeUrl(config), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Ocp-Apim-Subscription-Key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ base64Source: Buffer.from(fileBytes).toString("base64") }),
  });
  if (response.status !== 202) throw new Error("OCR provider did not accept this document.");
  const operation = response.headers.get("operation-location");
  if (!operation) throw new Error("OCR provider did not provide a result identifier.");
  let parsed: URL;
  try { parsed = new URL(operation); } catch {
    throw new Error("Unexpected OCR result location.");
  }
  const expectedPrefix = `${config.endpoint}/documentintelligence/documentModels/${MODEL}/analyzeResults/`;
  if (
    !parsed.toString().startsWith(expectedPrefix) ||
    parsed.origin !== config.endpoint ||
    parsed.searchParams.get("api-version") !== VERSION ||
    parsed.searchParams.size !== 1 ||
    parsed.hash
  ) throw new Error("Unexpected OCR result location.");
  const id = parsed.pathname.slice(new URL(expectedPrefix).pathname.length);
  if (!UUID.test(id)) throw new Error("Invalid OCR result identifier.");
  return id;
}

export type OcrJobClaims = {
  companyId: string;
  attachmentId: string;
  userId: string;
  resultId: string;
  issuedAt: number;
};
export function signOcrJob(config: Extract<OcrConfig, { configured: true }>, claims: OcrJobClaims): string {
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", config.signingKey).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
export function verifyOcrJob(
  config: Extract<OcrConfig, { configured: true }>,
  token: string,
  scope: { companyId: string; attachmentId: string; userId: string },
  now: number = Date.now(),
): OcrJobClaims {
  if (!token || token.length > 1500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error("Invalid or expired extraction request.");
  const [encoded, signature] = token.split(".");
  const expected = createHmac("sha256", config.signingKey)
    .update(encoded!).digest();
  const given = Buffer.from(signature!, "base64url");
  if (
    given.length !== expected.length ||
    given.toString("base64url") !== signature ||
    !timingSafeEqual(expected, given)
  ) throw new Error("Invalid or expired extraction request.");
  let parsed: Partial<OcrJobClaims>;
  try { parsed = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8")) as Partial<OcrJobClaims>; }
  catch { throw new Error("Invalid or expired extraction request."); }
  if (
    parsed.companyId !== scope.companyId ||
    parsed.attachmentId !== scope.attachmentId ||
    parsed.userId !== scope.userId ||
    !UUID.test(parsed.resultId ?? "") ||
    typeof parsed.issuedAt !== "number" ||
    !Number.isFinite(parsed.issuedAt) ||
    parsed.issuedAt > now + 5000 ||
    now - parsed.issuedAt > JOB_TTL_MS
  ) throw new Error("Invalid or expired extraction request.");
  return parsed as OcrJobClaims;
}

export async function checkAzureInvoiceOcr(
  config: Extract<OcrConfig, { configured: true }>,
  resultId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { status: "pending" }
  | { status: "failed"; message: string }
  | {
      status: "completed";
      suggestions: ReturnType<typeof parseAzureInvoiceSuggestions>["suggestions"];
      confidence: Record<string, number>;
      warnings: string[];
    }
> {
  const response = await fetchImpl(resultUrl(config, resultId), {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Ocp-Apim-Subscription-Key": config.apiKey },
  });
  if (!response.ok) throw new Error("Could not check the OCR provider result.");
  // Avoid buffering an unbounded provider response.
  if (Number(response.headers.get("content-length") ?? 0) > 4_000_000)
    throw new Error("OCR provider response exceeded the supported limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OCR provider returned an empty result.");
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) break;
      count += read.value.byteLength;
      if (count > 4_000_000) throw new Error("OCR provider response exceeded the supported limit.");
      chunks.push(read.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const content = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(content) as Record<string, unknown>; }
  catch { throw new Error("OCR provider returned invalid JSON."); }
  const status = payload.status;
  if (status === "running" || status === "notStarted") return { status: "pending" };
  if (status === "failed" || status === "canceled")
    return { status: "failed", message: "OCR extraction could not be completed." };
  if (status !== "succeeded") throw new Error("Unknown OCR provider status.");
  try {
    const result = parseAzureInvoiceSuggestions(payload);
    return { status: "completed", ...result };
  } catch {
    return { status: "failed", message: "No structured invoice fields were found. Enter the details manually." };
  }
}
