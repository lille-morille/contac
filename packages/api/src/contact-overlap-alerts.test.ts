import { describe, expect, it } from "vitest";
import { buildContactOverlapAlerts, type OverlapAlertContact } from "./contact-overlap-alerts.ts";

const own: OverlapAlertContact = {
  id: "own",
  orgId: "team-a",
  classId: "class-a",
  name: "Ada",
  teamName: "Team A",
  status: "ikke_kontaktet",
  assigneeId: null,
  email: "ada@example.no",
  phoneNormalized: null,
  normalizedName: "ada",
  companyName: "acme",
};
const other: OverlapAlertContact = {
  ...own,
  id: "other",
  orgId: "team-b",
  name: "Ada Other",
  teamName: "Team B",
  email: "ADA@example.no",
};

describe("contact overlap inbox", () => {
  it("includes uncontacted matches for both teams and routes assigned contacts", () => {
    expect(buildContactOverlapAlerts([own, other], "team-a", "member-a")).toEqual([
      {
        contactId: "own",
        contactName: "Ada",
        otherContactId: "other",
        otherTeamName: "Team B",
        otherStatus: "ikke_kontaktet",
      },
    ]);
    expect(buildContactOverlapAlerts([own, other], "team-b", "member-b")).toHaveLength(1);
    const assigned = { ...own, assigneeId: "member-a" };
    expect(buildContactOverlapAlerts([assigned, other], "team-a", "member-a")).toHaveLength(1);
    expect(buildContactOverlapAlerts([assigned, other], "team-a", "member-b")).toEqual([]);
  });

  it("hides dismissed, duplicate, and out-of-class matches", () => {
    expect(
      buildContactOverlapAlerts([own, other], "team-a", "member-a", [
        { contactId: "own", otherContactId: "other" },
      ]),
    ).toEqual([]);
    expect(
      buildContactOverlapAlerts([own, { ...other, status: "duplicate" }], "team-a", "member-a"),
    ).toEqual([]);
    expect(
      buildContactOverlapAlerts([own, { ...other, classId: "class-b" }], "team-a", "member-a"),
    ).toEqual([]);
  });
});
