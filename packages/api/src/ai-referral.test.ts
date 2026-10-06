import { describe, expect, it } from "vitest";
import { existingReferralMatch, referralCandidates } from "./ai.ts";

const conversations = [
  {
    id: "activity-1",
    summary: "Møt Kari Nord fra Nordhav AS; hun leder innkjøpene.",
    transcript: "Vi bør kontakte Kari Nord fra Nordhav AS før neste uke.",
  },
];

describe("conversation referrals", () => {
  it("requires an exact source passage and a different named person", () => {
    expect(
      referralCandidates(
        [
          {
            activityId: "activity-1",
            name: "Kari Nord",
            organization: "Nordhav AS",
            reason: "Hun leder innkjøpene og bør kontaktes.",
            sourcePassage: "Vi bør kontakte Kari Nord fra Nordhav AS",
          },
          {
            activityId: "activity-1",
            name: "Ola Nord",
            reason: "Mulig kontaktperson for prosjektet.",
            sourcePassage: "Ola Nord er prosjektleder",
          },
          {
            activityId: "activity-1",
            name: "Per Kilde",
            reason: "Kontakt ham om prosjektet.",
            sourcePassage: "Vi bør kontakte Kari Nord",
          },
        ],
        conversations,
        "Per Kilde",
      ),
    ).toEqual([
      {
        activityId: "activity-1",
        name: "Kari Nord",
        companyName: "Nordhav AS",
        email: "",
        phone: "",
        reason: "Hun leder innkjøpene og bør kontaktes.",
        passage: "Vi bør kontakte Kari Nord fra Nordhav AS",
      },
    ]);
  });

  it("links a confident existing match and avoids ambiguous names", () => {
    const existing = [
      {
        id: "one",
        name: "Kari Nord",
        companyName: "Nordhav AS",
        email: "kari@nordhav.no",
        phone: null,
      },
      { id: "two", name: "Kari Nord", companyName: "Sørhav AS", email: null, phone: null },
    ];
    expect(
      existingReferralMatch(
        { name: "Kari Nord", companyName: "Nordhav AS", email: "", phone: "" },
        existing,
        "source",
      ),
    ).toBe("one");
    expect(
      existingReferralMatch(
        { name: "Kari Nord", companyName: "", email: "", phone: "" },
        existing,
        "source",
      ),
    ).toBeNull();
    expect(
      existingReferralMatch(
        { name: "Ukjent", companyName: "", email: "KARI@NORDHAV.NO", phone: "" },
        existing,
        "source",
      ),
    ).toBe("one");
    expect(
      existingReferralMatch(
        { name: "Kari Nord", companyName: "Nordhav AS", email: "", phone: "" },
        existing,
        "one",
      ),
    ).toBeNull();
  });

  it("drops contact details that do not occur in the conversation", () => {
    const [candidate] = referralCandidates(
      [
        {
          activityId: "activity-1",
          name: "Kari Nord",
          organization: "Oppdiktet AS",
          email: "kari@oppdiktet.no",
          phone: "+47 999 99 999",
          reason: "Hun leder innkjøpene og bør kontaktes.",
          sourcePassage: "Møt Kari Nord fra Nordhav AS",
        },
      ],
      conversations,
      "Per Kilde",
    );
    expect(candidate).toMatchObject({ companyName: "", email: "", phone: "" });
  });
});
