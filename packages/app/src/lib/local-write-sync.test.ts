import { describe, expect, it } from "vitest";
import { beginLocalRowWrite, needsRowRead } from "./local-write-sync.ts";

const teamId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const revision = "2026-10-08T10:20:30.123Z";

describe("local write acknowledgement", () => {
  it("waits for an in-flight write and skips its matching broadcast", async () => {
    const finish = beginLocalRowWrite(teamId, "contacts", id);
    let settled = false;
    const read = needsRowRead({ teamId, entity: "contacts", id, revision }).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish(revision);
    expect(await read).toBe(false);
  });

  it("reads a newer teammate revision and recovers after a failed local write", async () => {
    const finish = beginLocalRowWrite(teamId, "contacts", id);
    const newer = needsRowRead({
      teamId,
      entity: "contacts",
      id,
      revision: "2026-10-08T10:20:31.123Z",
    });
    finish(revision);
    expect(await newer).toBe(true);

    const fail = beginLocalRowWrite(teamId, "contact_activities", id);
    const recovery = needsRowRead({ teamId, entity: "contact_activities", id, revision });
    fail();
    expect(await recovery).toBe(true);
  });
});
