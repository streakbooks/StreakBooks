// In-memory browser adapter; legal document workflow is verified by the SQL suites.
const params = new URLSearchParams(location.search);

export async function listPublishedLegalDocuments() {
  if (params.has("noterms")) return [];
  return [
    {
      id: "50000000-0000-4000-8000-000000000001",
      kind: "PARTNER_TERMS",
      locale: "en",
      version: 1,
      title: "Partner terms",
      status: "published",
      body: "Fixture partner terms for component verification.",
    },
  ];
}
