import { describe, expect, it } from "vitest";
import {
  CONTACT_PREFERENCE_KEYS,
  normalizeContactPreference,
  readCloudContactPreferences,
} from "./contact-directory-preferences";

describe("cloud contact directory preferences", () => {
  it("uses distinct per-field keys so columns and saved views do not overwrite each other", () => {
    expect(CONTACT_PREFERENCE_KEYS.columns).not.toEqual(CONTACT_PREFERENCE_KEYS.views);
    expect(Object.values(CONTACT_PREFERENCE_KEYS)).toHaveLength(2);
  });

  it("returns null when there is no cloud preference so the browser layout can be imported", () => {
    expect(readCloudContactPreferences([])).toEqual({ columns: null, views: null });
    expect(
      readCloudContactPreferences([
        { preference_key: "some.other.module", preference_value: ["name"] },
      ]),
    ).toEqual({ columns: null, views: null });
  });

  it("normalizes unknown columns and never permits hiding the contact name", () => {
    expect(normalizeContactPreference("columns", ["billing_city", "bad", "billing_city"])).toEqual([
      "name",
      "billing_city",
    ]);
    expect(normalizeContactPreference("columns", null)).toContain("name");
  });

  it("validates saved contact view names and group filters before storage", () => {
    const groupId = "01234567-89ab-cdef-0123-456789abcdef";
    const views = normalizeContactPreference("views", [
      {
        id: "view-1",
        name: "  Wholesale  ",
        view: "customers",
        filters: { groupId },
      },
      {
        id: "view-2",
        name: "wholesale",
        view: "suppliers",
        filters: { groupId: "bad-id" },
      },
    ]);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      name: "Wholesale",
      filters: { groupId },
    });
  });

  it("restores remote settings without combining one user's preferences with another", () => {
    expect(
      readCloudContactPreferences([
        { preference_key: CONTACT_PREFERENCE_KEYS.columns, preference_value: ["phone"] },
        {
          preference_key: CONTACT_PREFERENCE_KEYS.views,
          preference_value: [{ id: "view-1", name: "My saved contacts" }],
        },
        { preference_key: "other.module.key", preference_value: ["private"] },
      ]),
    ).toMatchObject({
      columns: ["name", "phone"],
      views: [{ id: "view-1", name: "My saved contacts" }],
    });
  });
});
