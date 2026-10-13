import { describe, expect, it } from "vitest";
import {
  chunkGroupSources,
  summarizeGroupInBatches,
  type GroupBatchRequest,
  type GroupConversationInput,
} from "./ai-group-batching.ts";

function conversation(id: string, summary: string, transcript: string): GroupConversationInput {
  return {
    id,
    kind: "meeting",
    date: "2026-10-13T10:00:00.000Z",
    participants: ["Ada"],
    contactNames: ["Ada"],
    summary,
    transcript,
  };
}

describe("group summary batching", () => {
  it("keeps every character of a large activity while bounding each model payload", () => {
    const source = conversation("one", "Et funn", `Start ${"lang tekst😀\n".repeat(400)} slutt`);
    const batches = chunkGroupSources([source], 900);
    expect(batches.length).toBeGreaterThan(1);
    expect(
      batches.every((batch) => JSON.stringify({ stage: "source", parts: batch }).length < 1000),
    ).toBe(true);
    const parts = batches.flat();
    expect(
      parts
        .filter((part) => part.field === "summary")
        .map((part) => part.text)
        .join(""),
    ).toBe(source.summary);
    expect(
      parts
        .filter((part) => part.field === "transcript")
        .map((part) => part.text)
        .join(""),
    ).toBe(source.transcript);
  });

  it("reconciles multiple source batches before returning one summary", async () => {
    const requests: GroupBatchRequest[] = [];
    const sources = Array.from({ length: 8 }, (_, index) =>
      conversation(String(index), "Funn ".repeat(20), "Samtale ".repeat(20)),
    );
    const result = await summarizeGroupInBatches(
      sources,
      async (request) => {
        requests.push(request);
        return request.stage === "source" ? "Delsammendrag" : "Samlet sammendrag";
      },
      800,
    );
    expect(requests.filter((request) => request.stage === "source").length).toBeGreaterThan(1);
    expect(requests.some((request) => request.stage === "merge")).toBe(true);
    expect(result).toBe("Samlet sammendrag");
  });
});
