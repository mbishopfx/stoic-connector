import { z } from "zod";
import { AppError, currentUser, responseError } from "@/lib/supabase";
import { listOwnerHandoffHistory, parseHandoffHistoryFilters, readOwnerHandoffHistory } from "@/lib/handoff-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const params = new URL(request.url).searchParams;
    const handoffId = params.get("id");
    if (handoffId) {
      const parsedId = z.uuid().safeParse(handoffId);
      if (!parsedId.success) throw new AppError("Handoff ID is invalid.", 400);
      return Response.json(await readOwnerHandoffHistory(user.id, parsedId.data), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const filters = parseHandoffHistoryFilters(params);
    return Response.json(await listOwnerHandoffHistory(user.id, filters), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
