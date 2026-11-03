export type PasswordRule = { id: string; label: string; met: boolean };

export type PasswordStrength = {
  /** 0 = empty, 1 weak … 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: "" | "Weak" | "Fair" | "Good" | "Strong";
  rules: PasswordRule[];
  /** Server minimum (8 chars, a letter and a number) is satisfied. */
  acceptable: boolean;
};

const COMMON = [
  "password",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "linkbooks",
  "123456",
  "abc123",
];

/** Heuristic only — the Supabase password policy remains the authority. */
export function scorePassword(password: string, context: string[] = []): PasswordStrength {
  const rules: PasswordRule[] = [
    { id: "length", label: "At least 8 characters", met: password.length >= 8 },
    { id: "letter", label: "A letter", met: /[A-Za-z]/.test(password) },
    { id: "number", label: "A number", met: /\d/.test(password) },
  ];
  const acceptable = rules.every((r) => r.met);
  if (!password) return { score: 0, label: "", rules, acceptable };

  const lower = password.toLowerCase();
  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  const personal = context
    .map((c) => c.trim().toLowerCase())
    .flatMap((c) => c.split(/[\s@._-]+/))
    .filter((c) => c.length >= 3);
  const weakPattern =
    COMMON.some((w) => lower.includes(w)) ||
    personal.some((p) => lower.includes(p)) ||
    /(.)\1{2,}/.test(password) ||
    /^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(password);
  if (weakPattern) points -= 2;

  let score: PasswordStrength["score"];
  if (!acceptable || points <= 2) score = 1;
  else if (points <= 3) score = 2;
  else if (points <= 4) score = 3;
  else score = 4;

  const label = (["", "Weak", "Fair", "Good", "Strong"] as const)[score];
  return { score, label, rules, acceptable };
}
