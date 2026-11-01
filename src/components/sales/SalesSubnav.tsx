import { ModuleSubnav } from "@/components/common/ModuleSubnav";
import { SALES_SECTIONS } from "@/lib/document-sections";
export function SalesSubnav() {
  return <ModuleSubnav label="Sales" items={SALES_SECTIONS} settings={{ to: "/sales/settings" }} />;
}
