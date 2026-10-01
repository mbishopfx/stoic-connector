import type { Platform } from "@/lib/config";
import { isGrokBotHarness, resolveAgentHarnessId } from "@/lib/agent-harness";

export type AgentConnectionGuide = {
  text: string;
  code: string;
  docs: string;
};

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function agentConnectionGuide(platform: Platform, endpoint: string, harnessName: string): AgentConnectionGuide | null {
  const harness = resolveAgentHarnessId(harnessName, platform);

  if (harness === "muse") return null;

  if (harness === "claude") return {
    text: "Claude Code can connect directly to Stoic over remote HTTP MCP. Keep STOIC_AGENT_KEY in a private environment store; Claude Code expands its reference in the Authorization header below. Claude on the web, Cowork, and Claude Desktop use Claude's remote custom connector flow; Stoic must have that Claude OAuth client registered before sign-in. Never put a Stoic password or bearer key in a Claude chat.",
    code: `{
  "mcpServers": {
    "stoic-connector": {
      "type": "http",
      "url": ${JSON.stringify(endpoint)},
      "headers": { "Authorization": "Bearer \${STOIC_AGENT_KEY}" }
    }
  }
}`,
    docs: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  };

  if (harness === "chatgpt") return {
    text: "Use the installed Stoic app or add a custom MCP app from ChatGPT's plugin/app settings with this public endpoint. Complete the registered Stoic OAuth sign-in, then enable Stoic in the conversation's tools menu. For a managed workspace, an admin may need to allow custom apps first.",
    code: endpoint,
    docs: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
  };

  if (harness === "gemini") return {
    text: "Gemini CLI supports remote HTTP MCP. Add the endpoint, then keep this profile's bearer key in a private user settings file as an Authorization header. Its documented header option stores a static value locally, so do not pass the real key as a command argument or save it in a shared project file.",
    code: `gemini mcp add --transport http stoic-connector ${shellQuote(endpoint)}\n\nAfterward, add the bearer header in the private Gemini user settings, restart Gemini CLI, then verify with gemini mcp list and a Stoic check_inbox.`,
    docs: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
  };

  if (harness === "grok" && isGrokBotHarness(harnessName)) return {
    text: "Grok Bot supports Remote HTTPS MCP plugins and personal routines. For a personal Bot, add this profile key through protected credential setup. A Team Bot key is shared across teammates, so use Stoic OAuth for per-user access or pause before adding a shared key. Verify one Stoic inbox check. Its routine belongs to the person who creates it and reports in that person's Bot conversation; it does not run for a whole team.",
    code: endpoint,
    docs: "https://docs.x.ai/grok-bot/team-bots",
  };

  if (harness === "grok") return {
    text: "Grok web supports custom MCP connectors for interactive conversations. Add this endpoint at grok.com/connectors → New Connector → Custom. For Business or Enterprise workspaces, a team admin must provision the connector first. This path does not establish an unattended schedule.",
    code: endpoint,
    docs: "https://docs.x.ai/grok/connectors",
  };

  if (harness === "codex") return {
    text: "Make STOIC_AGENT_KEY available to the Codex process, then add the server. Restart Codex after changing its environment. Keep the key out of prompts and shell history.",
    code: `codex mcp add stoic-connector --url ${shellQuote(endpoint)} --bearer-token-env-var STOIC_AGENT_KEY`,
    docs: "https://developers.openai.com/codex/mcp",
  };

  if (harness === "hermes") return {
    text: "Merge this entry into mcp_servers in the intended Hermes profile's config.yaml. Store STOIC_AGENT_KEY in that profile's private secret environment file, not the config or chat.",
    code: `mcp_servers:\n  stoic_connector:\n    url: ${JSON.stringify(endpoint)}\n    headers:\n      Authorization: "Bearer \${STOIC_AGENT_KEY}"`,
    docs: "https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp",
  };

  if (harness === "openclaw") return {
    text: "Make STOIC_AGENT_KEY available to the intended OpenClaw Gateway, then add this Streamable HTTP server to its outbound MCP registry. Keep the key in an owner-controlled secret store, not a shared config file, chat, shell history, or logs.",
    code: `"stoic-connector": {\n  "url": ${JSON.stringify(endpoint)},\n  "transport": "streamable-http",\n  "headers": { "Authorization": "Bearer \${STOIC_AGENT_KEY}" }\n}`,
    docs: "https://docs.openclaw.ai/cli/mcp/transports",
  };

  return {
    text: "Use this harness's documented remote Streamable HTTP MCP settings. Store the profile's bearer key only in a private credential location. If the harness cannot securely store the key or authenticate remote MCP, stop and report the missing step. A successful Stoic inbox check is the proof that the connection works.",
    code: `{"url": ${JSON.stringify(endpoint)}, "transport": "streamable-http", "headers": {"Authorization": "Bearer <STOIC_AGENT_KEY>"}}`,
    docs: "https://modelcontextprotocol.io/specification/2025-03-26/basic/transports",
  };
}
