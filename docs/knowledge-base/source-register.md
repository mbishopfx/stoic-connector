# Knowledge-base source register

This register records the evidence used for the first contract/graph slice. It does not claim that a provider accepts Stoic, renders the graph, or runs the Steward.

| Source | Verified claim | Confidence | Integration implication |
| --- | --- | --- | --- |
| `../research/cross-agent-connectors.md` | Existing browser/API research separates MCP host behavior, native schedules, A2A contracts, and unknown Grok/Muse surfaces. | High for the recorded observation date | Keep transport, host, schedule, and live acceptance as separate proof fields. |
| https://modelcontextprotocol.io/specification/2025-06-18 | MCP defines host/client/server roles, capability negotiation, resources, prompts, tools, and explicit user-control/security guidance. | High for the reviewed version; newer version visibility is a compatibility gate | Knowledge tools must be typed, scoped, and read-only by default; no generic forwarding. |
| https://a2a-protocol.org/latest/specification/ | A2A defines Agent Cards, task/context/artifact lifecycles, idempotency, streaming, cancellation, and capability validation. | High for protocol specification; not provider acceptance | Keep the knowledge core protocol-neutral; do not replace MCP or claim A2A support without an exact endpoint probe. |
| https://developers.openai.com/learn/docs-mcp | OpenAI documents a public read-only Streamable HTTP MCP server and Codex connection setup. | High for the public docs surface | Host-specific setup guidance is useful, but a configured URL is not a successful check-in proof. |
| https://docs.openclaw.ai/cli/mcp | OpenClaw documents separate server/client MCP surfaces and a live capability probe. | High for the public docs surface | Connection health must distinguish saved configuration, probe/authentication, and Stoic check-in. |
| https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector | Anthropic documents remote HTTPS MCP over Streamable HTTP/SSE with tool-oriented allow/deny controls. | High for the public docs surface | Expose narrow semantic knowledge reads and do not infer MCP App/resource support from tool support. |
| `src/lib/knowledge.ts` | Local parser/serializer/graph builder is the implementation artifact for this pass. | Verified by unit/type/build gates after implementation | Future persistence and MCP routes should call the same contract rather than reimplementing parsing. |
| `MASTER_PLAN.md` and `state.md` | Knowledge Base/graph is a P0 paid-value direction; the pilot Stripe configuration stays $5 test mode. | High for product scope | No billing, production, or provider mutation belongs in this slice. |

## Unresolved gates

- Supabase/Storage schema and project-scoped persistence are not implemented by this slice.
- The three-times-daily scheduler and Codex-harness execution path are design-only.
- Authenticated MCP knowledge list/search/read/evidence tools are not yet implemented or live-verified.
- Owner graph controls and the read-only graph explorer are not yet implemented or live-verified.
- OpenAI app-directory acceptance, Codex/Hermes/OpenClaw/Claude host rendering, Grok web, and consumer Muse remain separate provider gates.
