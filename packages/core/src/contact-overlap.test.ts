import { expect, it } from "vitest";
import { contactsOverlap, type OverlapContact } from "./contact-overlap.ts";

const person: OverlapContact = {
  email: "Ada@Example.no",
  phoneNormalized: "91234567",
  normalizedName: "ada nordmann",
  companyName: "rana as",
};
it("matches an engaged contact by email, phone, or name and organization", () => {
  expect(
    contactsOverlap(person, {
      ...person,
      email: "ada@example.no",
      phoneNormalized: null,
      normalizedName: "other",
      companyName: "other",
    }),
  ).toBe(true);
  expect(
    contactsOverlap(person, {
      ...person,
      email: null,
      normalizedName: "other",
      companyName: "other",
    }),
  ).toBe(true);
  expect(contactsOverlap(person, { ...person, email: null, phoneNormalized: null })).toBe(true);
  expect(
    contactsOverlap(person, {
      ...person,
      email: null,
      phoneNormalized: null,
      companyName: "another company",
    }),
  ).toBe(false);
});
