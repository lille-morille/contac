import { describe, expect, it } from "vitest";
import { formatFullContactLog } from "./full-contact-log.ts";

describe("full contact log", () => {
  it("keeps the complete activity content in chronological order and omits research notes", () => {
    const text = formatFullContactLog(
      { name: "Kari", companyName: "Gruve AS", description: "Beslutningstaker" },
      [
        {
          id: "later",
          kind: "meeting",
          occurredAt: "2026-10-04T10:00:00.000Z",
          summary: "Sammendrag",
          transcript: "Hele transkripsjonen",
          missedOutcome: null,
          participantNames: ["Kari", "Ola"],
          attachmentNames: ["møte.pdf"],
        },
        {
          id: "earlier",
          kind: "phone",
          occurredAt: "2026-10-03T10:00:00.000Z",
          summary: "Første samtale",
          transcript: "",
          missedOutcome: null,
          participantNames: ["Kari"],
          attachmentNames: [],
        },
        {
          id: "later",
          kind: "meeting",
          occurredAt: "2026-10-04T10:00:00.000Z",
          summary: "Sammendrag",
          transcript: "Hele transkripsjonen",
          missedOutcome: null,
          participantNames: ["Kari", "Ola"],
          attachmentNames: ["møte.pdf"],
        },
      ],
    );
    expect(text.indexOf("Første samtale")).toBeLessThan(text.lastIndexOf("Sammendrag"));
    expect(text).toContain("Hele transkripsjonen");
    expect(text).toContain("møte.pdf");
    expect(text).toContain("Kari, Ola");
    expect(text.match(/Hele transkripsjonen/g)).toHaveLength(1);
    expect(text).not.toContain("sharedNote");
  });
});
