import { describe, expect, it } from "vitest";
import { compareContactUpdated } from "./contact-sort.ts";

describe("contact update sorting", () => {
  it("ignores workflow revisions when content timestamps are unchanged", () => {
    const a = { id: "a", updatedAt: "2026-10-08T12:00:00Z", sortUpdatedAt: "2026-10-07T12:00:00Z" };
    const b = { id: "b", updatedAt: "2026-10-08T11:00:00Z", sortUpdatedAt: "2026-10-08T11:00:00Z" };
    expect([a, b].sort(compareContactUpdated).map((c) => c.id)).toEqual(["b", "a"]);
  });
  it("keeps equal content timestamps stable even when the API reorders workflow revisions", () => {
    const a = { id: "a", updatedAt: "new", sortUpdatedAt: "same" };
    const b = { id: "b", updatedAt: "old", sortUpdatedAt: "same" };
    expect([b, a].sort(compareContactUpdated).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("supports the pre-migration response", () => {
    expect(
      compareContactUpdated(
        { id: "a", updatedAt: "2026-10-07" },
        { id: "b", updatedAt: "2026-10-08" },
      ),
    ).toBeGreaterThan(0);
  });
});
