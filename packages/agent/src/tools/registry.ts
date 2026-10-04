import { messages } from "@contac/core/db";
import type { Database } from "@contac/core/db";
import { and, desc, eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

/** A narrow, tenant-scoped tool registry. Add product tools here with explicit org filters. */
export function toolsForRun(db: Database, orgId: string, conversationId: string) {
  return {
    recent_messages: tool({
      description:
        "Look up recent messages in this conversation when you need to check earlier context.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ limit }) => {
        const rows = await db
          .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.orgId, orgId), eq(messages.conversationId, conversationId)))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
        return rows.reverse();
      },
    }),
  };
}
