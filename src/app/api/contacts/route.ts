import { z } from "zod";
import { AppError, currentUser, responseError } from "@/lib/supabase";
import { listContacts, listContactSources } from "@/lib/contacts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const url = new URL(request.url);
    const offset = z.coerce.number().int().min(0).max(100_000).parse(url.searchParams.get("offset") || "0");
    const sourcesFor = url.searchParams.get("sourcesFor");
    if (sourcesFor) {
      const data = await listContactSources(user.id, z.uuid().parse(sourcesFor), offset);
      return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
    }
    const status = url.searchParams.get("status") || undefined;
    if (status && !["new", "contacted", "qualified", "customer", "archived"].includes(status)) throw new AppError("Choose a valid contact status", 400);
    const data = await listContacts(user.id, { search: url.searchParams.get("q") || "", offset, status });
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
