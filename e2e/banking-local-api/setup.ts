/** Fail once, before any scenario seeds transactions, if the explicit app is absent. */
export default async function setup() {
  try {
    const response = await fetch("http://127.0.0.1:8098/auth", {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error("Local app did not return a successful response");
    await response.body?.cancel();
  } catch {
    throw new Error(
      "Start the isolated app first: npm run dev:banking:local -- --env-file /private/path/local-supabase.env. This suite only uses localhost:8098.",
    );
  }
}
