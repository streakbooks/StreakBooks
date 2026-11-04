import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceMigrationWizard } from "../../src/components/imports/SourceMigrationWizard";
import { getImportDefinition } from "../../src/lib/imports/import-definitions";
export function Fixture() {
  const [csv, setCsv] = useState("");
  const receive = useCallback((value: string) => setCsv(value), []);
  return (
    <>
      <SourceMigrationWizard
        definition={getImportDefinition("sales", "Invoices")}
        companyId="fixture-company"
        currency="USD"
        disabled={false}
        onValidated={receive}
      />
      <output aria-label="Validated payload">{csv}</output>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
