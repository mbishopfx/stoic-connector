import { z } from "zod";
import { currentUser, assertSameOrigin, AppError, responseError } from "@/lib/supabase";
import {
  getOwnerKnowledgeOverview,
  knowledgeSettingsInput,
  updateOwnerKnowledgeSettings,
  upsertOwnerKnowledgeNote,
} from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const projectId = z.uuid();
const notePath = z.string().trim().min(5).max(240);

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const value = new URL(request.url).searchParams.get("projectId");
    return Response.json(await getOwnerKnowledgeOverview(user.id, projectId.parse(value)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 100_000) throw new AppError("Request too large", 413);
    const user = await currentUser();
    const raw = await request.text();
    if (raw.length > 100_000) throw new AppError("Request too large", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = z.enum(["upsert_note", "update_settings"]).parse(body.action);
    if (action === "upsert_note") {
      const parsed = z.object({ projectId, path: notePath, markdown: z.string().min(1).max(40_000) }).parse(body);
      return Response.json({ data: await upsertOwnerKnowledgeNote(user.id, parsed.projectId, parsed.path, parsed.markdown) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const settings = knowledgeSettingsInput.parse(body);
    return Response.json({ data: await updateOwnerKnowledgeSettings(user.id, settings) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
