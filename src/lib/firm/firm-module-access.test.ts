import { describe, expect, it } from "vitest";
import { firmAccessModuleKey } from "./firm-module-access";

describe("firm module access log keys", () => {
  it("records dashboard and top-level module visits", () => {
    expect(firmAccessModuleKey("/")).toBe("dashboard");
    expect(firmAccessModuleKey("/accounting/accounts")).toBe("accounting");
    expect(firmAccessModuleKey("/sales/invoices/123")).toBe("sales");
  });

  it("normalizes module names and fails closed for malformed paths", () => {
    expect(firmAccessModuleKey("/advisors-portal/tasks")).toBe("advisors_portal");
    expect(firmAccessModuleKey("///")).toBe("dashboard");
  });
});
