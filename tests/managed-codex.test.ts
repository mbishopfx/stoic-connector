import { beforeEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    beta = { agents: { sessions: { create: openAiMocks.createSession, delete: openAiMocks.deleteSession } } };
  },
}));

import { runManagedCodexJson } from "../src/lib/managed-codex";

describe("managed Codex runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_INTAKE_API_KEY = "test-managed-agent-key";
  });

  it("uses the OpenAI Platform managed Codex session with no tools or execution environment", async () => {
    const stream = Object.assign((async function* () {
      yield { type: "agent.session.created", session_id: "session-123" };
      yield { type: "agent.session.turn.output_text.done", item_id: "item-1", content_index: 0, text: '{"ok":true}' };
      yield { type: "agent.session.turn.completed", turn: { subagent_id: null } };
    })(), { controller: { abort: vi.fn() } });
    openAiMocks.createSession.mockResolvedValue(stream);
    openAiMocks.deleteSession.mockResolvedValue({ id: "session-123" });

    const result = await runManagedCodexJson({
      product: "stoic-test",
      instructions: "Return the requested JSON.",
      schema: { type: "object", properties: { ok: { type: "boolean" } } },
      userInput: "Test input",
    });

    expect(result).toEqual({ ok: true });
    expect(openAiMocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      agent: expect.objectContaining({
        model: "gpt-6-luna",
        tools: [],
        multi_agent: { enabled: false },
      }),
      environment: { type: "none" },
      metadata: { product: "stoic-test" },
      stream: true,
    }));
    expect(openAiMocks.deleteSession).toHaveBeenCalledWith("session-123");
    expect(stream.controller.abort).toHaveBeenCalledOnce();
  });
});
