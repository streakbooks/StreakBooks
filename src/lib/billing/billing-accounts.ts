/**
 * Billing account contracts shared by server functions, the future /api/v1 REST layer and the
 * UI. The database functions are the authority; these schemas validate inputs early and parse
 * responses so callers never trust unvalidated JSON.
 */
import { z } from "zod";

export const COUNTRY_SOURCES = [
  "IP_GEOLOCATION",
  "USER_SELECTED",
  "VERIFIED_BILLING_ADDRESS",
] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const billingAccountSchema = z.object({
  id: z.uuid(),
  accountType: z.enum(["INDIVIDUAL", "ORGANIZATION"]),
  displayName: z.string(),
  status: z.enum(["ACTIVE", "CLOSED"]),
  billingEmail: z.string().nullable(),
  legalName: z.string().nullable(),
  address: z.object({
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    postalCode: z.string().nullable(),
  }),
  billingCountry: z.string().length(2).nullable(),
  countrySource: z.enum(COUNTRY_SOURCES).nullable(),
  taxIdScheme: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  userLimit: z.number().int().positive().nullable(),
  companyLimit: z.number().int().positive(),
  isOwner: z.boolean(),
  updatedAt: z.string(),
  companies: z.array(z.object({ id: z.uuid(), name: z.string() })),
  permissions: z.object({ view: z.boolean(), manage: z.boolean(), paymentMethods: z.boolean() }),
});
export type BillingAccount = z.infer<typeof billingAccountSchema>;

/** Editable profile fields. Unknown keys are rejected here and again in the database. */
export const billingProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    billingEmail: z.union([z.email().max(320), z.literal("")]).nullable(),
    legalName: optionalText(200),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(120),
    region: optionalText(120),
    postalCode: optionalText(20),
    billingCountry: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((v) => v.toUpperCase())
      .nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });
export type BillingProfileUpdate = z.infer<typeof billingProfileSchema>;

export const updateBillingProfileInput = z.object({
  accountId: z.uuid(),
  expectedUpdatedAt: z.string().min(1),
  profile: billingProfileSchema,
});

export const companyInput = z.object({ companyId: z.uuid() });
