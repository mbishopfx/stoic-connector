import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import sharp from "sharp";
import { canPreviewImageArtifact, canPreviewTextArtifact } from "@/lib/artifact-mime";
import { canPreviewOfficeArtifact, extractOfficePreview } from "@/lib/office-preview";
import { extractRtfPreview } from "@/lib/rtf-preview";
import { adminDb, AppError } from "@/lib/supabase";
import { redactSynthesisSecrets } from "@/lib/synthesis-input";
import type { IntakeImage } from "@/lib/intake-model";

type StoredFile = { id: string; name: string; mime_type: string; size_bytes: number; storage_path: string };
export type IntakeFileResult = {
  notes: { id: string; name: string; note: string }[];
  images: IntakeImage[];
  transcript: string;
  warnings: string[];
  readableInput: boolean;
  voiceTranscriptionFailed: boolean;
};

const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/m4a"]);

async function pdfText(bytes: Uint8Array) {
  const document = await getDocumentProxy(bytes);
  try {
    if (document.numPages <= 30) {
      const extracted = await extractText(document, { mergePages: true });
      return String(extracted.text).slice(0, 5000);
    }
    const pages: string[] = [];
    for (let index = 1; index <= 30; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      page.cleanup();
    }
    return `${pages.join("\n").slice(0, 4800)}\n[Preview includes the first 30 of ${document.numPages} pages.]`;
  } finally { await document.cleanup(); }
}

async function transcribeAudio(bytes: Uint8Array, name: string, mimeType: string) {
  const key = process.env.OPENAI_INTAKE_API_KEY;
  if (!key) throw new AppError("Voice transcription is not configured", 503);
  const client = new OpenAI({ apiKey: key, timeout: 55_000, maxRetries: 0 });
  const file = await toFile(bytes, name, { type: mimeType });
  const result = await client.audio.transcriptions.create({ model: "gpt-transcribe", file });
  return result.text.trim().slice(0, 12000);
}

export async function readIntakeFiles(workspaceId: string, projectId: string, ids: string[]): Promise<IntakeFileResult> {
  if (!ids.length) return { notes: [], images: [], transcript: "", warnings: [], readableInput: false, voiceTranscriptionFailed: false };
  const db = adminDb();
  const { data, error } = await db.from("artifacts")
    .select("id,name,mime_type,size_bytes,storage_path")
    .eq("workspace_id", workspaceId).eq("project_id", projectId).eq("status", "ready").in("id", ids);
  if (error) throw error;
  if (!data || data.length !== ids.length) throw new AppError("One or more files are unavailable in this project", 404);
  const files = new Map(data.map((item) => [item.id, item as StoredFile]));
  const result: IntakeFileResult = { notes: [], images: [], transcript: "", warnings: [], readableInput: false, voiceTranscriptionFailed: false };
  for (const id of ids) {
    const file = files.get(id)!;
    const download = await db.storage.from("stoic-artifacts").download(file.storage_path);
    if (download.error || !download.data) throw new AppError("Could not read an attached file", 502);
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    if (bytes.byteLength !== file.size_bytes) throw new AppError("An attached file changed during intake", 409);
    let note = "This file is attached for the assigned agent. Its content was not previewed by Stoic.";
    const isAudio = AUDIO_TYPES.has(file.mime_type);
    try {
      const isRtf = ["application/rtf", "text/rtf", "application/x-rtf"].includes(file.mime_type) || file.name.toLowerCase().endsWith(".rtf");
      if (isRtf) {
        note = extractRtfPreview(bytes);
        if (note.trim()) result.readableInput = true;
        else {
          note = "RTF file is attached, but Stoic found no readable text in the preview window.";
          result.warnings.push(`${file.name}: Stoic found no readable text in the preview window. The original file remains attached for your agents.`);
        }
      } else if (canPreviewTextArtifact(file.name, file.mime_type)) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 60_000));
        if (text.includes("\0")) note = "Binary data; no text preview available.";
        else {
          note = text.slice(0, 5000);
          result.readableInput ||= Boolean(text.trim());
        }
      } else if (file.mime_type === "application/pdf") {
        note = await pdfText(bytes);
        result.readableInput ||= Boolean(note.trim());
      } else if (file.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const extracted = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
        note = extracted.value.slice(0, 5000);
        result.readableInput ||= Boolean(extracted.value.trim());
      } else if (canPreviewOfficeArtifact(file.name, file.mime_type)) {
        const preview = extractOfficePreview(bytes, file.mime_type, file.name);
        if (preview?.text) {
          note = `${preview.kind} preview:\n${preview.text}`;
          result.readableInput = true;
        } else {
          note = `${preview?.kind || "Office file"} is attached, but Stoic found no readable text in the preview window.`;
          result.warnings.push(`${file.name}: Stoic found no readable text in the preview window. The original file remains attached for your agents.`);
        }
      } else if (canPreviewImageArtifact(file.name, file.mime_type)) {
        const resized = await sharp(bytes, { limitInputPixels: 40_000_000, pages: 1 }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
        result.images.push({ name: file.name, dataUrl: `data:image/jpeg;base64,${resized.toString("base64")}` });
        note = "Image preview supplied to the intake model.";
        result.readableInput = true;
      } else if (isAudio) {
        const transcript = await transcribeAudio(bytes, file.name, file.mime_type);
        result.transcript = [result.transcript, transcript].filter(Boolean).join("\n\n").slice(0, 12000);
        if (transcript) {
          note = `Transcript: ${transcript.slice(0, 5000)}`;
          result.readableInput = true;
        } else {
          result.voiceTranscriptionFailed = true;
          result.warnings.push(`${file.name}: no speech was detected. Try another recording or add a text note.`);
          note = "Audio contained no recognizable speech.";
        }
      }
    } catch {
      note = "This file is attached for the assigned agent. Stoic could not preview its content.";
      if (isAudio) {
        result.voiceTranscriptionFailed = true;
        result.warnings.push(`${file.name}: Stoic could not transcribe this voice memo. The file remains attached; try another recording or add a text note.`);
      } else {
        result.warnings.push(`${file.name}: Stoic could not preview its contents. The file remains attached for your agents.`);
      }
    }
    result.notes.push({ id, name: file.name, note: redactSynthesisSecrets(note).slice(0, 5000) });
  }
  return result;
}

export function hasReadableIntakeInput(text: string, files: IntakeFileResult) {
  return Boolean(text.trim() || files.readableInput);
}
