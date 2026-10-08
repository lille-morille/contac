import { describe, expect, it } from "vitest";
import { reportNumbersFromTeamName } from "./report-team-name.ts";

describe("report numbers from team name", () => {
  it.each(["Syretest 4 Gruppe 5", "  syretest 4   GRUPPE 5  "])(
    "parses both numbers from %s",
    (name) => {
      expect(reportNumbersFromTeamName(name)).toEqual({ studyNumber: "4", group: "5" });
    },
  );

  it("keeps the existing group-only default", () => {
    expect(reportNumbersFromTeamName("Gruppe 5")).toEqual({ studyNumber: "", group: "5" });
  });

  it.each(["Syretest 4 Gruppe 5 prosjekt", "Prosjekt 4 5", "Syretest 4"])(
    "does not guess numbers in %s",
    (name) => {
      expect(reportNumbersFromTeamName(name)).toEqual({ studyNumber: "", group: name });
    },
  );
});
