import { describe, expect, it } from "vitest";
import {
  activityContacts,
  companyDomains,
  contactActivities,
  contacts,
  groupAiSummaries,
} from "@contac/core/db";
import { getTableColumns } from "drizzle-orm";
import { groupContext } from "./ai.ts";
import type { ApiDeps } from "./types.ts";

const people = [
  { id: "person-a", name: "Ada", allow: true },
  { id: "person-b", name: "Bo", allow: true },
  { id: "person-c", name: "Cy", allow: false },
];
const timestamp = new Date("2026-01-02T10:00:00Z");
function activity(id: string) {
  return {
    id,
    kind: "meeting",
    summary: `${id} samtale`,
    transcript: "Samtaletekst",
    occurredAt: timestamp,
    updatedAt: timestamp,
  };
}
const shared = activity("shared");
const individual = activity("individual");
const excluded = activity("excluded");

function fakeDeps() {
  let personIndex = 0;
  let activityIndex = 0;
  let linksIndex = 0;
  const db = {
    select(selection: Record<string, unknown>) {
      let table: unknown;
      let joined: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        innerJoin(value: unknown) {
          joined = value;
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        then(resolve: (value: unknown[]) => void) {
          let rows: unknown[] = [];
          if (table === companyDomains) rows = [{ companyId: "company-1" }];
          else if (table === contacts && "name" in selection) rows = people;
          else if (table === contacts && "contact" in selection) {
            const person = people[personIndex++]!;
            rows = [
              {
                contact: {
                  id: person.id,
                  name: person.name,
                  companyId: "company-1",
                  allowExternalAi: person.allow,
                  description: null,
                },
                companyName: "Example AS",
              },
            ];
          } else if (table === activityContacts && joined === contactActivities) {
            rows = (activityIndex++ === 0 ? [shared, individual] : [shared, excluded]).map(
              (item) => ({ activity: item }),
            );
          } else if (table === activityContacts && joined === contacts) {
            rows = (
              linksIndex++ === 0
                ? [
                    { activityId: "shared", allow: true },
                    { activityId: "shared", allow: true },
                    { activityId: "individual", allow: true },
                  ]
                : [
                    { activityId: "shared", allow: true },
                    { activityId: "shared", allow: true },
                    { activityId: "excluded", allow: false },
                  ]
            ) as unknown[];
          }
          resolve(rows);
        },
      };
      return query;
    },
  };
  return { db } as unknown as ApiDeps;
}

describe("group conversation context", () => {
  it("reads the saved summary timestamp from the migrated column", () => {
    expect(getTableColumns(groupAiSummaries).generatedAt.name).toBe("generated_at");
  });

  for (const kind of ["company", "domain"] as const) {
    it(`counts linked contacts and includes each eligible activity once for ${kind}`, async () => {
      const context = await groupContext(fakeDeps(), "team-1", kind, "target-1");
      expect(context.linkedCount).toBe(3);
      expect(context.included.length).toBe(2);
      expect(context.excludedCount).toBe(1);
      expect(context.conversations.map((item) => item.id).sort()).toEqual(["individual", "shared"]);
      expect(context.conversations.find((item) => item.id === "shared")?.contactNames).toEqual([
        "Ada",
        "Bo",
      ]);
    });
  }
});
