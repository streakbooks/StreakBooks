import { ModuleSubnav } from "@/components/common/ModuleSubnav";
import { PURCHASES_SECTIONS } from "@/lib/document-sections";
export function PurchasesSubnav() {
  return (
    <ModuleSubnav
      label="Purchases"
      items={PURCHASES_SECTIONS}
      settings={{ to: "/purchases/settings" }}
    />
  );
}
