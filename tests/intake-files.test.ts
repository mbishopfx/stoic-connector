import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  artifacts: [] as { id: string; name: string; mime_type: string; size_bytes: number; storage_path: string }[],
  download: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: () => ({
    from: () => {
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "eq", "in"]) query[method] = () => query;
      query.then = (resolve, reject) => Promise.resolve({ data: mocks.artifacts, error: null })
        .then(resolve as (value: unknown) => unknown, reject as (reason: unknown) => unknown);
      return query;
    },
    storage: { from: () => ({ download: mocks.download }) },
  }),
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { transcriptions: { create: mocks.transcribe } };
    constructor() {}
  },
}));
vi.mock("openai/uploads", () => ({ toFile: vi.fn(async (bytes, name, options) => ({ bytes, name, options })) }));

import { hasReadableIntakeInput, readIntakeFiles } from "../src/lib/intake-files";

describe("owner intake file previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_INTAKE_API_KEY", "test-only-key");
    mocks.artifacts = [{ id: "artifact-a", name: "voice.webm", mime_type: "audio/webm", size_bytes: 10, storage_path: "workspace/project/voice.webm" }];
    mocks.download.mockResolvedValue({ data: new Blob(["voice memo"]) });
  });

  it("reports a transcription failure without hiding it or forwarding provider details", async () => {
    mocks.transcribe.mockRejectedValue(new Error("private upstream detail"));

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.voiceTranscriptionFailed).toBe(true);
    expect(files.readableInput).toBe(false);
    expect(files.warnings[0]).toContain("voice.webm");
    expect(files.warnings[0]).toContain("could not transcribe");
    expect(files.warnings[0]).not.toContain("private upstream detail");
  });

  it("marks a successful voice transcript as readable input", async () => {
    mocks.transcribe.mockResolvedValue({ text: "Please review the launch memo." });

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.transcript).toBe("Please review the launch memo.");
    expect(files.readableInput).toBe(true);
    expect(files.voiceTranscriptionFailed).toBe(false);
    expect(hasReadableIntakeInput("", files)).toBe(true);
  });

  it("uses a bounded local spreadsheet preview without sending the file to another AI service", async () => {
    const workbook = zipSync({
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Quarterly plan</t></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row></sheetData></worksheet>"),
    });
    mocks.artifacts = [{
      id: "artifact-a", name: "plan.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: workbook.byteLength, storage_path: "workspace/project/plan.xlsx",
    }];
    mocks.download.mockResolvedValue({ data: new Blob([workbook]) });

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.readableInput).toBe(true);
    expect(files.notes[0].note).toContain("A1=Quarterly plan");
    expect(files.warnings).toEqual([]);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("previews source text by filename even when the upload MIME type is generic", async () => {
    const source = "export const queueMode = 'review-first';";
    mocks.artifacts = [{
      id: "artifact-a", name: "team-rules.ts", mime_type: "application/octet-stream",
      size_bytes: Buffer.byteLength(source), storage_path: "workspace/project/team-rules.ts",
    }];
    mocks.download.mockResolvedValue({ data: new Blob([source]) });

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.readableInput).toBe(true);
    expect(files.notes[0].note).toContain("queueMode = 'review-first'");
  });

  it("uses the bounded local RTF preview as readable input", async () => {
    const source = String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}Please \b review\b0\ this plan.}`;
    mocks.artifacts = [{
      id: "artifact-a", name: "plan.rtf", mime_type: "application/rtf",
      size_bytes: Buffer.byteLength(source), storage_path: "workspace/project/plan.rtf",
    }];
    mocks.download.mockResolvedValue({ data: new Blob([source]) });

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.readableInput).toBe(true);
    expect(files.notes[0].note).toBe("Please review this plan.");
    expect(files.warnings).toEqual([]);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("uses the local OpenDocument preview when the upload has a generic MIME type", async () => {
    const document = zipSync({
      "content.xml": strToU8("<office:document-content><text:p>Review the <text:span>launch</text:span> schedule.</text:p></office:document-content>"),
    });
    mocks.artifacts = [{
      id: "artifact-a", name: "schedule.odt", mime_type: "application/octet-stream",
      size_bytes: document.byteLength, storage_path: "workspace/project/schedule.odt",
    }];
    mocks.download.mockResolvedValue({ data: new Blob([document]) });

    const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

    expect(files.readableInput).toBe(true);
    expect(files.notes[0].note).toBe("Document preview:\nReview the launch schedule.");
    expect(files.warnings).toEqual([]);
  });

  it("converts supported AVIF, TIFF, and GIF images to bounded JPEG previews", async () => {
    const source = sharp({ create: { width: 3, height: 2, channels: 3, background: "#52745f" } });
    const samples = [
      { name: "photo.avif", mime: "application/octet-stream", bytes: await source.clone().avif().toBuffer() },
      { name: "scan.tiff", mime: "image/tiff", bytes: await source.clone().tiff().toBuffer() },
      { name: "animation.gif", mime: "image/gif", bytes: await source.clone().gif().toBuffer() },
    ];

    for (const sample of samples) {
      mocks.artifacts = [{
        id: "artifact-a", name: sample.name, mime_type: sample.mime,
        size_bytes: sample.bytes.byteLength, storage_path: `workspace/project/${sample.name}`,
      }];
      mocks.download.mockResolvedValue({ data: new Blob([sample.bytes]) });

      const files = await readIntakeFiles("workspace-a", "project-a", ["artifact-a"]);

      expect(files.readableInput).toBe(true);
      expect(files.images).toHaveLength(1);
      expect(files.images[0].name).toBe(sample.name);
      expect(files.images[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(files.warnings).toEqual([]);
    }
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("does not spend an intake model call when there is no readable instruction or file content", () => {
    const files = { notes: [], images: [], transcript: "", warnings: [], readableInput: false, voiceTranscriptionFailed: false };

    expect(hasReadableIntakeInput("  ", files)).toBe(false);
    expect(hasReadableIntakeInput("Please review this file", files)).toBe(true);
  });
});
