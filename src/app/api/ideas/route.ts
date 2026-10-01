import { z } from "zod";
import { AppError, currentUser, responseError } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import { getWorkspaceIdeas } from "@/lib/ideas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const workspace = await requireActiveWorkspace(user.id);
    const url = new URL(request.url);
    const offset = z.coerce.number().int().min(0).max(100_000).safeParse(url.searchParams.get("offset") || "0");
    if (!offset.success) throw new AppError("Choose a valid idea history page", 400);
    const data = await getWorkspaceIdeas(workspace.id, offset.data);
    const nextOffset = data.length === 200 && offset.data + data.length <= 100_000 ? offset.data + data.length : null;
    return Response.json({ data, nextOffset }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
