import { agentEvents, agentRuns, conversations, messages, createDb } from "@contac/core/db";
import { and, asc, eq } from "drizzle-orm";
import { AnthropicAgent } from "./llm/provider.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, client } = createDb(url, 5);
const provider = new AnthropicAgent();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let running = true;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    running = false;
  });

/** Claim one queued or expired run atomically across worker instances. */
async function claim() {
  const rows = await client<
    Array<{ id: string; org_id: string; conversation_id: string; attempt: number }>
  >`
    UPDATE public.agent_runs AS r
    SET status = 'running', attempt = r.attempt + 1, locked_until = now() + interval '10 minutes', updated_at = now()
    WHERE r.id = (
      SELECT id FROM public.agent_runs
      WHERE (status = 'queued' AND (locked_until IS NULL OR locked_until < now())) OR (status = 'running' AND locked_until < now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING r.id, r.org_id, r.conversation_id, r.attempt`;
  return rows[0];
}

async function processRun(run: NonNullable<Awaited<ReturnType<typeof claim>>>) {
  const lease = setInterval(() => {
    void db
      .update(agentRuns)
      .set({ lockedUntil: new Date(Date.now() + 600_000) })
      .where(
        and(
          eq(agentRuns.id, run.id),
          eq(agentRuns.attempt, run.attempt),
          eq(agentRuns.status, "running"),
        ),
      );
  }, 60_000);
  try {
    await db.insert(agentEvents).values({
      orgId: run.org_id,
      runId: run.id,
      type: "started",
      detail: { attempt: run.attempt },
    });
    const history = await db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(and(eq(messages.orgId, run.org_id), eq(messages.conversationId, run.conversation_id)))
      .orderBy(asc(messages.createdAt));
    const result = await provider.run(
      {
        orgId: run.org_id,
        conversationId: run.conversation_id,
        messages: history,
        emit: async (type, detail) => {
          await db.insert(agentEvents).values({ orgId: run.org_id, runId: run.id, type, detail });
        },
      },
      db,
    );
    if (!result.text.trim()) throw new Error("Agent returned an empty response");
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .update(agentRuns)
        .set({ status: "completed", lockedUntil: null, updatedAt: new Date(), error: null })
        .where(
          and(
            eq(agentRuns.id, run.id),
            eq(agentRuns.attempt, run.attempt),
            eq(agentRuns.status, "running"),
          ),
        )
        .returning({ id: agentRuns.id });
      if (!owned) return;
      await tx.insert(messages).values({
        orgId: run.org_id,
        conversationId: run.conversation_id,
        role: "assistant",
        content: result.text,
      });
      await tx.insert(agentEvents).values({
        orgId: run.org_id,
        runId: run.id,
        type: "completed",
        detail: {
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(conversations.id, run.conversation_id), eq(conversations.orgId, run.org_id)));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = run.attempt < 3 && !message.includes("ANTHROPIC_API_KEY is not configured");
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .update(agentRuns)
        .set({
          status: retry ? "queued" : "failed",
          lockedUntil: retry ? new Date(Date.now() + 2 ** run.attempt * 1000) : null,
          error: message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentRuns.id, run.id),
            eq(agentRuns.attempt, run.attempt),
            eq(agentRuns.status, "running"),
          ),
        )
        .returning({ id: agentRuns.id });
      if (owned)
        await tx.insert(agentEvents).values({
          orgId: run.org_id,
          runId: run.id,
          type: retry ? "retrying" : "failed",
          detail: { attempt: run.attempt, error: message.slice(0, 1000) },
        });
    });
    console.error(`[agent] run ${run.id}: ${message}`);
  } finally {
    clearInterval(lease);
  }
}

console.log("Agent worker started");
try {
  while (running) {
    try {
      const run = await claim();
      if (run) await processRun(run);
      else await sleep(1500);
    } catch (error) {
      console.error("[agent] worker error:", error);
      await sleep(5000);
    }
  }
} finally {
  await client.end();
}
