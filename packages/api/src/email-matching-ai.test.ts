import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage } from "@contac/core/db";
import { encrypt } from "./ai-token.ts";
import { extractInboundContactEmails } from "./ai.ts";
import type { ApiDeps } from "./types.ts";

beforeEach(() => {
  vi.stubEnv("AI_ENCRYPTION_KEY", "test-email-matching-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fixture(mode = "suggest", hasToken = true) {
  const usage: Record<string, unknown>[] = [];
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  emails: ["OLIVER.HAYDEN@tum.de", "invented@example.no"],
                }),
              },
            },
          ],
          model: "test/low",
          usage: { prompt_tokens: 50, completion_tokens: 20, cost: 0.001 },
        }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const deps = {
    db: {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              modes: { email_matching: mode },
              encryptedToken: hasToken ? encrypt("team-five-token") : null,
              lowModel: "test/low",
              model: "test/medium",
              emailDraftEnabled: false,
            },
          ],
        }),
      }),
      insert: (table: unknown) => ({
        values: async (value: Record<string, unknown>) => {
          expect(table).toBe(aiUsage);
          usage.push(value);
        },
      }),
    },
  } as unknown as ApiDeps;
  return { deps, fetchMock, usage };
}

describe("team-owned inbound email extraction", () => {
  it("uses only the owning team's token and low model, bills that team and rejects invented addresses", async () => {
    const { deps, fetchMock, usage } = fixture();
    expect(
      await extractInboundContactEmails(
        deps,
        "team-5",
        "oliver.hayden@tum.de<mailto:oliver.hayden@tum.de>",
      ),
    ).toEqual(["oliver.hayden@tum.de"]);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer team-five-token");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "test/low",
      provider: { zdr: true, data_collection: "deny" },
    });
    expect(usage).toEqual([
      expect.objectContaining({
        orgId: "team-5",
        feature: "email_matching",
        model: "test/low",
        costUsd: "0.001",
      }),
    ]);
  });

  it.each([
    ["off", true],
    ["suggest", false],
  ])("does not call AI when mode=%s and token=%s", async (mode, token) => {
    const { deps, fetchMock, usage } = fixture(mode, token);
    expect(await extractInboundContactEmails(deps, "team-5", "oliver.hayden@tum.de")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usage).toEqual([]);
  });

  it("propagates provider and invalid-output failures for manual inbox fallback", async () => {
    const { deps, fetchMock } = fixture();
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(extractInboundContactEmails(deps, "team-5", "body")).rejects.toThrow("503");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "invalid JSON" } }] })),
    );
    await expect(extractInboundContactEmails(deps, "team-5", "body")).rejects.toThrow();
  });
});
