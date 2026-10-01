import OpenAI from "openai";
import { AppError } from "@/lib/supabase";

type StructuredSchema = Record<string, unknown>;
type ModelEvent = { type: string; session_id?: string; item_id?: string; content_index?: number; text?: string; turn?: { subagent_id?: string | null } };

/** Runs a no-tools turn in OpenAI's managed Codex agent session. */
export async function runManagedCodexJson(input: {
  product: string;
  instructions: string;
  schema: StructuredSchema;
  userInput: string;
}) {
  const apiKey = process.env.OPENAI_INTAKE_API_KEY;
  if (!apiKey) throw new AppError("Stoic's managed Codex service is not configured", 503);

  const client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 });
  let sessionId: string | null = null;
  let completed = false;
  const parts = new Map<string, string>();

  try {
    const events = await client.beta.agents.sessions.create({
      agent: {
        model: "gpt-6-luna",
        instructions: input.instructions,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", schema: input.schema }, verbosity: "low" },
        multi_agent: { enabled: false },
        tools: [],
      },
      environment: { type: "none" },
      input: [{ role: "user", content: [{ type: "input_text", text: input.userInput }] }],
      metadata: { product: input.product },
      stream: true,
    });

    try {
      for await (const event of events) {
        const typed = event as ModelEvent;
        if (typed.session_id) sessionId = typed.session_id;
        if (typed.type === "agent.session.turn.output_text.done" && typeof typed.text === "string") {
          parts.set(`${typed.item_id}:${typed.content_index}`, typed.text);
        }
        if (typed.type === "agent.session.turn.failed" && typed.turn?.subagent_id == null) {
          throw new AppError("The managed Codex run failed", 503);
        }
        if (typed.type === "agent.session.turn.cancelled" && typed.turn?.subagent_id == null) {
          throw new AppError("The managed Codex run was cancelled", 503);
        }
        if (["agent.session.failed", "agent.session.environment.failed", "error"].includes(typed.type)) {
          throw new AppError("The managed Codex service is unavailable", 503);
        }
        if (typed.type === "agent.session.turn.completed" && typed.turn?.subagent_id == null) {
          completed = true;
          break;
        }
      }
    } finally {
      events.controller.abort();
    }

    if (!completed) throw new AppError("The managed Codex response ended before completion", 503);
    const text = [...parts.values()].join("\n").trim();
    if (!text) throw new AppError("The managed Codex response was empty", 503);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AppError("The managed Codex response was not valid structured data", 503);
    }
  } finally {
    if (sessionId) await client.beta.agents.sessions.delete(sessionId).catch(() => {});
  }
}
