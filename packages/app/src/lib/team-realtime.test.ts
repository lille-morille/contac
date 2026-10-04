import { describe, expect, it } from "vitest";
import { keysForTeamChange, type TeamChange } from "./team-realtime.tsx";

const team = "11111111-1111-4111-8111-111111111111";
function change(entity: string, operation: TeamChange["operation"] = "insert"): TeamChange {
  return {
    teamId: team,
    entity,
    id: "22222222-2222-4222-8222-222222222222",
    operation,
    revision: "2026-10-04T12:00:00Z",
  };
}

describe("team change invalidation", () => {
  it("does not invalidate another team's data", () => {
    expect(keysForTeamChange({ ...change("contacts"), teamId: "other" }, team)).toEqual([]);
  });
  it("uses a targeted row fetch for frequent text updates", () => {
    expect(keysForTeamChange(change("contacts", "update"), team)).not.toContainEqual([
      "contact-data",
      team,
      "core",
    ]);
    expect(keysForTeamChange(change("contact_activities", "update"), team)).not.toContainEqual([
      "contact-data",
      team,
      "activities",
    ]);
  });
  it("refreshes relationship, library, session, view, and inbox queries", () => {
    expect(keysForTeamChange(change("activity_contacts"), team)).toContainEqual([
      "contact-data",
      team,
      "activities",
    ]);
    expect(keysForTeamChange(change("library_items"), team)).toContainEqual(["library", team]);
    expect(keysForTeamChange(change("checkin_sessions"), team)).toContainEqual(["sessions", team]);
    expect(keysForTeamChange(change("saved_contact_views"), team)).toContainEqual([
      "contact-data",
      team,
      "core",
    ]);
    expect(keysForTeamChange(change("log_access_requests"), team)).toContainEqual(["inbox", team]);
    expect(keysForTeamChange(change("search_chunks"), team)).toContainEqual([
      "semantic-search",
      team,
    ]);
    expect(keysForTeamChange(change("ai_usage"), team)).toContainEqual(["ai-usage", team]);
  });
  it.each([
    ["company_domains", "core"],
    ["contact_person_tags", "core"],
    ["departments", "core"],
    ["activity_files", "activities"],
    ["workspace_files", "activities"],
    ["email_activities", "activities"],
  ])("routes %s to the %s workspace slice", (entity, slice) => {
    expect(keysForTeamChange(change(entity), team)).toContainEqual(["contact-data", team, slice]);
  });
  it("routes shared documents and drafts to their visible panels", () => {
    expect(keysForTeamChange(change("email_drafts"), team)).toContainEqual(["email-drafts", team]);
    expect(keysForTeamChange(change("loi_versions"), team)).toContainEqual(["lois", team]);
    expect(keysForTeamChange(change("ai_suggestions"), team)).toContainEqual(["contact-ai", team]);
  });
});
