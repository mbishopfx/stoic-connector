const oauthSecuritySchemes = [{ type: "oauth2", scopes: [] }];

function requestHasToolsList(payload: unknown): boolean {
  if (Array.isArray(payload)) return payload.some(requestHasToolsList);
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as { method?: unknown }).method === "tools/list";
}

export async function addOAuthSecurityToMcpResponse(request: Request, response: Response): Promise<Response> {
  if (request.method !== "POST" || !requestHasToolsList(await request.clone().json().catch(() => null))) return response;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) return response;

  const body = await response.clone().text();
  let changed = false;
  let output = body;

  if (contentType.includes("application/json")) {
    try {
      const result = addOAuthSecurityToToolList(JSON.parse(body));
      changed = result.changed;
      if (changed) output = JSON.stringify(result.payload);
    } catch {
      return response;
    }
  } else {
    output = body.replace(/^(data:\s*)(\{.*\})$/gm, (line, prefix: string, json: string) => {
      try {
        const result = addOAuthSecurityToToolList(JSON.parse(json));
        if (!result.changed) return line;
        changed = true;
        return `${prefix}${JSON.stringify(result.payload)}`;
      } catch {
        return line;
      }
    });
  }

  if (!changed) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  return new Response(output, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Add OpenAI's per-tool OAuth declaration to a standard MCP tools/list result.
 * The current MCP server SDK does not expose this extension on registerTool.
 */
export function addOAuthSecurityToToolList(payload: unknown): { payload: unknown; changed: boolean } {
  if (Array.isArray(payload)) {
    let changed = false;
    const items = payload.map((item) => {
      const result = addOAuthSecurityToToolList(item);
      changed ||= result.changed;
      return result.payload;
    });
    return { payload: changed ? items : payload, changed };
  }

  if (typeof payload !== "object" || payload === null) return { payload, changed: false };
  const envelope = payload as { result?: { tools?: unknown[] } };
  if (!Array.isArray(envelope.result?.tools)) return { payload, changed: false };

  return {
    payload: {
      ...envelope,
      result: {
        ...envelope.result,
        tools: envelope.result.tools.map((tool) => {
          if (typeof tool !== "object" || tool === null) return tool;
          return { ...tool, securitySchemes: oauthSecuritySchemes };
        }),
      },
    },
    changed: true,
  };
}
