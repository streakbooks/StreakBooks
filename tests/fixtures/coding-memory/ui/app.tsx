import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { CodingMemoryPanel } from "@/components/banking/CodingMemoryPanel";
import "@/styles.css";
window.memoryFixture = { canCode: true, delay: 30, failures: 0, calls: [], preference: () => {} };
const client = new QueryClient();
function App() {
  const [companyId, setCompanyId] = useState("11111111-1111-4111-8111-111111111111");
  const [enabled, setEnabled] = useState(true);
  const [canCode, setCanCode] = useState(true);
  const [available, setAvailable] = useState(true);
  const [selected, setSelected] = useState("");
  window.memoryFixture.canCode = canCode;
  window.memoryFixture.preference = setEnabled;
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-3xl p-4">
        <h1>Coding Memory isolated UI fixture</h1>
        <button onClick={() => setCanCode(!canCode)}>Toggle read-only role</button>
        <button onClick={() => setAvailable(!available)}>Toggle migration availability</button>
        <button
          onClick={() => {
            setSelected("");
            setCompanyId("44444444-4444-4444-8444-444444444444");
          }}
        >
          Switch company
        </button>
        <output aria-label="Selected account">{selected}</output>
        <CodingMemoryPanel
          key={companyId}
          companyId={companyId}
          transactionId="22222222-2222-4222-8222-222222222222"
          available={available}
          onSelect={setSelected}
          preferences={[
            {
              history_id: "33333333-3333-4333-8333-333333333333",
              payee_normalized: "cloud hosting",
              offset_account_id: "expense",
              direction: "out",
              times_used: 3,
              account_code: "6000",
              account_name: "Hosting",
              enabled,
              last_approved_at: "2026-11-01T00:00:00Z",
              latest_journal_id: "journal",
            },
          ]}
          suggestions={
            enabled
              ? [
                  {
                    offsetAccountId: "expense",
                    accountCode: "6000",
                    accountName: "Hosting",
                    confidence: 0.7,
                    reason: "Three approved postings",
                    matchStrength: "exact history",
                    conflictingHistory: true,
                    source: "history",
                    historyId: "33333333-3333-4333-8333-333333333333",
                    ruleId: null,
                  },
                ]
              : []
          }
        />
        <Toaster />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
