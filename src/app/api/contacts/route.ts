import { z } from "zod";
import { currentUser, responseError } from "@/lib/supabase";
import { listContacts, listContactSources } from "@/lib/contacts";
import { contactSearchSchema } from "@/lib/contact-filters";

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
    const filters = contactSearchSchema.parse({
      search: url.searchParams.get("q") || "",
      field: url.searchParams.get("field") || undefined,
      status: url.searchParams.get("status") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      contactability: url.searchParams.get("contactability") || undefined,
      activity: url.searchParams.get("activity") || undefined,
      sort: url.searchParams.get("sort") || undefined,
      offset,
    });
    const data = await listContacts(user.id, filters);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
