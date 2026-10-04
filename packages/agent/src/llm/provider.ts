import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import type { Database } from "@contac/core/db";
import { toolsForRun } from "../tools/registry.ts";

export interface AgentInput {
  orgId: string;
  conversationId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  emit: (type: string, detail: Record<string, unknown>) => Promise<void>;
}
export interface AgentResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}
export interface AgentProvider {
  run(input: AgentInput, db: Database): Promise<AgentResult>;
}

/** Swap this provider for another model or agent runtime without changing the worker. */
export class AnthropicAgent implements AgentProvider {
  async run(input: AgentInput, db: Database): Promise<AgentResult> {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
    const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";
    const result = await generateText({
      model: anthropic(model),
      system:
        "You are a helpful assistant in a multi-tenant application. Use only the current conversation and the provided tools. Never claim to know data from another organization. Ask for clarification when the task needs product-specific tools that are not installed.",
      messages: input.messages,
      tools: toolsForRun(db, input.orgId, input.conversationId),
      stopWhen: stepCountIs(8),
      onStepFinish: async ({ toolCalls }) => {
        if (toolCalls.length)
          await input.emit("tools_used", { names: toolCalls.map((call) => call.toolName) });
      },
    });
    return {
      text: result.text,
      model,
      inputTokens: result.totalUsage.inputTokens ?? 0,
      outputTokens: result.totalUsage.outputTokens ?? 0,
    };
  }
}
