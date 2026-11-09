/** Lightweight CRM lead form validation used before any server mutation.
 * The current CRM schema stores deal estimates in hundredths of a currency unit.
 * Do not coerce malformed or negative user input to zero.
 */
export type CrmLeadFormInput = {
  firstName: string;
  lastName: string;
  organizationName: string;
  email: string;
  estimatedMajor: string;
};

export type CrmLeadFormResult =
  | { valid: true; estimatedValueMinor: number; message: null }
  | { valid: false; estimatedValueMinor: null; message: string };

export function validateCrmLeadForm(input: CrmLeadFormInput): CrmLeadFormResult {
  if (![input.firstName, input.lastName, input.organizationName, input.email].some((v) => v.trim())) {
    return {
      valid: false,
      estimatedValueMinor: null,
      message: "Enter a name, organisation or email to identify this lead.",
    };
  }

  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      valid: false,
      estimatedValueMinor: null,
      message: "Enter a valid email address or leave it blank.",
    };
  }

  const raw = input.estimatedMajor.trim();
  if (raw && !^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    return {
      valid: false,
      estimatedValueMinor: null,
      message: "Estimated value must be zero or greater, with up to two decimal places.",
    };
  }

  const [whole = "0", fraction = ""] = (raw || "0").split(".");
  const estimatedValueMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(estimatedValueMinor)) {
    return {
      valid: false,
      estimatedValueMinor: null,
      message: "Estimated value is too large.",
    };
  }
  return { valid: true, estimatedValueMinor, message: null };
}
