import { describe, expect, it } from "vitest";
import { isReligiousOrganisation, organisationTerms } from "./terminology";

describe("organisation terminology", () => {
  it("keeps donor language for an NGO and member language for a church", () => {
    expect(organisationTerms("ngo").sections.donors).toBe("Donors");
    expect(organisationTerms("ngo").sections.donations).toBe("Donations");
    expect(organisationTerms("ngo").sections.programmes).toBe("Programmes");
    expect(organisationTerms("church").sections.donors).toBe("Members");
    expect(organisationTerms("church").sections.donations).toBe("Tithes and offerings");
    expect(organisationTerms("church").sections.programmes).toBe("Ministries");
    expect(organisationTerms("mosque").household).toBe("Family");
    expect(organisationTerms("foundation").sections.donors).toBe("Donors");
    expect(isReligiousOrganisation("temple")).toBe(true);
    expect(isReligiousOrganisation("charity")).toBe(false);
    expect(organisationTerms("unknown").sections.donors).toBe("Donors");
  });
});
