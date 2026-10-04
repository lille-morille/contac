import { expect, it } from "vitest";
import { contactMatchesEmail, emailList, sameEmailSet } from "./email.ts";

it("matches recipients regardless of order and case, but not extra recipients", () => {
  expect(sameEmailSet(["A@EXAMPLE.NO", "b@example.no"], ["b@example.no", "a@example.no"])).toBe(
    true,
  );
  expect(sameEmailSet(["a@example.no"], ["a@example.no", "b@example.no"])).toBe(false);
});
it("deduplicates and matches Cc contacts", () => {
  expect(emailList(" A@example.no; a@EXAMPLE.no, b@example.no ")).toEqual([
    "a@example.no",
    "b@example.no",
  ]);
  expect(
    contactMatchesEmail("CC@example.no", {
      fromEmail: "other@example.no",
      toEmails: [],
      ccEmails: ["cc@example.no"],
    }),
  ).toBe(true);
});
