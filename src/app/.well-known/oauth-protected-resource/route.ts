import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { mcpResourceUri, requiredEnv } from "@/lib/config";

export function GET(request: Request) {
  return protectedResourceHandler({
    authServerUrls: [`${requiredEnv("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1`],
    resourceUrl: mcpResourceUri(),
  })(request);
}
export const OPTIONS = metadataCorsOptionsRequestHandler();
