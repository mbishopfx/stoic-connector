import { describe, expect, it } from "vitest";
import { addOAuthSecurityToMcpResponse, addOAuthSecurityToToolList } from "../src/lib/mcp-metadata";

describe("OpenAI MCP tool metadata", () => {
  it("adds OAuth security requirements to each listed tool", () => {
    const response = {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "check_inbox" }, { name: "create_handoff", annotations: { readOnlyHint: false } }] },
    };

    const result = addOAuthSecurityToToolList(response);

    expect(result.changed).toBe(true);
    expect((result.payload as typeof response).result.tools).toEqual([
      { name: "check_inbox", securitySchemes: [{ type: "oauth2", scopes: [] }] },
      { name: "create_handoff", annotations: { readOnlyHint: false }, securitySchemes: [{ type: "oauth2", scopes: [] }] },
    ]);
  });

  it("leaves non tools/list JSON-RPC responses unchanged", async () => {
    const response = Response.json({ jsonrpc: "2.0", id: 2, result: { tools: [] } });
    const decorated = await addOAuthSecurityToMcpResponse(
      new Request("https://stoic.bishoptech.dev/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_inbox" } }),
      }),
      response,
    );

    expect(decorated).toBe(response);
  });

  it("decorates Streamable HTTP event responses while preserving the event stream", async () => {
    const request = new Request("https://stoic.bishoptech.dev/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    const response = new Response(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 3, result: { tools: [{ name: "get_team_context" }] } })}\n\n`,
      { headers: { "content-type": "text/event-stream", "content-length": "1" } },
    );

    const decorated = await addOAuthSecurityToMcpResponse(request, response);
    const body = await decorated.text();
    const envelope = JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? "{}");

    expect(body).toContain("event: message");
    expect(decorated.headers.get("content-length")).toBeNull();
    expect(envelope.result.tools[0].securitySchemes).toEqual([{ type: "oauth2", scopes: [] }]);
  });
});
