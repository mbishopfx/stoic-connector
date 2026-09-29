import { z } from "zod";
import { currentUser, assertSameOrigin, AppError, responseError } from "@/lib/supabase";
import {
  getOwnerKnowledgeOverview,
  ownerKnowledgeNoteInput,
  readOwnerKnowledgeNote,
  saveOwnerKnowledgeNote,
  knowledgeSettingsInput,
  updateOwnerKnowledgeSettings,
  upsertOwnerKnowledgeNote,
} from "@/lib/knowledge-store";
import { runOwnerKnowledgeSteward } from "@/lib/knowledge-steward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const projectId = z.uuid();
const notePath = z.string().trim().min(5).max(240);
const noteId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const params = new URL(request.url).searchParams;
    const value = params.get("projectId");
    const requestedNoteId = params.get("noteId");
    if (requestedNoteId) {
      return Response.json(await readOwnerKnowledgeNote(user.id, projectId.parse(value), noteId.parse(requestedNoteId)), {
        headers: { "Cache-Control": "no-store" },
      });
    }
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
    const action = z.enum(["upsert_note", "save_note", "update_settings", "refresh_now"]).parse(body.action);
    if (action === "upsert_note") {
      const parsed = z.object({ projectId, path: notePath, markdown: z.string().min(1).max(40_000) }).parse(body);
      return Response.json({ data: await upsertOwnerKnowledgeNote(user.id, parsed.projectId, parsed.path, parsed.markdown) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (action === "save_note") {
      const parsed = ownerKnowledgeNoteInput.parse(body);
      return Response.json({ data: await saveOwnerKnowledgeNote(user.id, parsed) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (action === "refresh_now") {
      const parsed = z.object({ projectId }).parse(body);
      return Response.json({ data: await runOwnerKnowledgeSteward(user.id, parsed.projectId) }, {
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
