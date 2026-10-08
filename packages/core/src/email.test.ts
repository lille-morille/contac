import { expect, it } from "vitest";
import {
  contactMatchesEmail,
  emailList,
  sameEmailSet,
  extractEmailAddresses,
  matchingInboundContacts,
} from "./email.ts";

it("matches recipients regardless of order and case, but not extra recipients", () => {
  expect(sameEmailSet(["A@EXAMPLE.NO", "b@example.no"], ["b@example.no", "a@example.no"])).toBe(
    true,
  );
  expect(sameEmailSet(["a@example.no"], ["a@example.no", "b@example.no"])).toBe(false);
});

it("extracts and deduplicates forwarded Outlook addresses in multiple languages", () => {
  expect(
    extractEmailAddresses(`oliver.hayden@tum.de<mailto:oliver.hayden@tum.de>
Am 08.10.2026 um 09:04 schrieb Lenart Heuchele
<LENNARH@stud.ntnu.no<mailto:lennarh@stud.ntnu.no>>:
Fra: Ada <ada+research@example.no>
Til: bob@example.co.uk; bad@localhost`),
  ).toEqual([
    "oliver.hayden@tum.de",
    "lennarh@stud.ntnu.no",
    "ada+research@example.no",
    "bob@example.co.uk",
  ]);
});

it("uses validated extraction without replacing the original headers", () => {
  const message = {
    fromEmail: "forwarder@example.no",
    toEmails: ["contac@plingapp.no"],
    ccEmails: [],
    body: "oliver.hayden@tum.de<mailto:oliver.hayden@tum.de>",
    extractedEmails: ["oliver.hayden@tum.de"],
  };
  const contact = { id: "oliver", email: "OLIVER.HAYDEN@tum.de" };
  expect(matchingInboundContacts([contact, { id: "empty", email: null }], message)).toEqual([
    contact,
  ]);
  expect(message.fromEmail).toBe("forwarder@example.no");
  expect(matchingInboundContacts([contact], { ...message, extractedEmails: [] })).toEqual([]);
});

it("keeps direct matching authoritative and excludes Bcc from contact matching", () => {
  const direct = { email: "direct@example.no" };
  const signature = { email: "signature@example.no" };
  expect(
    matchingInboundContacts([direct, signature], {
      fromEmail: "sender@example.no",
      toEmails: [],
      ccEmails: [direct.email],
      body: signature.email,
      extractedEmails: [signature.email],
    }),
  ).toEqual([direct]);
  expect(
    matchingInboundContacts([direct], {
      fromEmail: "sender@example.no",
      toEmails: [],
      ccEmails: [],
      body: "",
      bccEmails: [direct.email],
    } as Parameters<typeof matchingInboundContacts>[1]),
  ).toEqual([]);
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
