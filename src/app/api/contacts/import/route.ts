import { z } from "zod";
import { AppError, assertSameOrigin, currentUser, responseError } from "@/lib/supabase";
import { importOwnerContacts } from "@/lib/contacts";
import { MAX_CONTACT_CSV_BYTES } from "@/lib/contact-csv";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request, "multipart/form-data");
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_CONTACT_CSV_BYTES + 64_000) throw new AppError("Contact CSV files can be up to 4 MB", 413);
    const user = await currentUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a CSV file to import", 400);
    if (!file.name.toLowerCase().endsWith(".csv")) throw new AppError("Choose a .csv file", 415);
    if (file.size > MAX_CONTACT_CSV_BYTES) throw new AppError("Contact CSV files can be up to 4 MB", 413);
    if (file.type && !["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(file.type)) {
      throw new AppError("Choose a CSV file", 415);
    }
    const idempotencyKey = z.string().min(8).max(128).parse(form.get("idempotencyKey"));
    const sourceLabel = z.string().trim().min(2).max(180).parse(form.get("sourceLabel") || "CSV import");
    const projectRaw = form.get("projectId");
    const projectId = projectRaw ? z.uuid().parse(projectRaw) : null;
    let csvText: string;
    try {
      csvText = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new AppError("Contact CSV must use UTF-8 text", 400);
    }
    const data = await importOwnerContacts(user.id, {
      fileName: file.name,
      csvText,
      sourceLabel,
      projectId,
      idempotencyKey,
    });
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
