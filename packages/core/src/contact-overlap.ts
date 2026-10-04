import { normalizeEmail } from "./email.ts";

export type OverlapContact = {
  email: string | null;
  phoneNormalized: string | null;
  normalizedName: string;
  companyName: string;
};

export function contactsOverlap(a: OverlapContact, b: OverlapContact): boolean {
  return !!(
    (a.email && b.email && normalizeEmail(a.email) === normalizeEmail(b.email)) ||
    (a.phoneNormalized && b.phoneNormalized && a.phoneNormalized === b.phoneNormalized) ||
    (a.normalizedName === b.normalizedName && a.companyName === b.companyName)
  );
}
