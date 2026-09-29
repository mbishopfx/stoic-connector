import { describe, expect, it } from "vitest";
import { canPreviewImageArtifact, canPreviewTextArtifact, safeArtifactMime, SUPPORTED_ARTIFACT_MIME } from "../src/lib/artifact-mime";

describe("artifact MIME normalization", () => {
  it("keeps supported media types and strips parameters", () => {
    expect(safeArtifactMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(safeArtifactMime("application/pdf")).toBe("application/pdf");
    expect(safeArtifactMime("application/rtf")).toBe("application/rtf");
    expect(safeArtifactMime("application/vnd.oasis.opendocument.text")).toBe("application/vnd.oasis.opendocument.text");
    expect(safeArtifactMime("image/avif")).toBe("image/avif");
    expect(safeArtifactMime("image/tiff")).toBe("image/tiff");
    expect(safeArtifactMime("image/gif")).toBe("image/gif");
  });

  it("stores unfamiliar file types as downloadable binary attachments", () => {
    expect(safeArtifactMime("application/x-photoshop")).toBe("application/octet-stream");
    expect(safeArtifactMime("")).toBe("application/octet-stream");
    expect(SUPPORTED_ARTIFACT_MIME.has(safeArtifactMime("application/x-photoshop"))).toBe(true);
  });

  it("previews common text and source files but never previews credential files", () => {
    expect(canPreviewTextArtifact("src/app.ts", "application/octet-stream")).toBe(true);
    expect(canPreviewTextArtifact("notes.yaml", "text/yaml")).toBe(true);
    expect(canPreviewTextArtifact(".env.local", "text/plain")).toBe(false);
    expect(canPreviewTextArtifact("credentials.json", "application/json")).toBe(false);
    expect(canPreviewTextArtifact("identity.p12", "application/octet-stream")).toBe(false);
  });

  it("previews only supported image formats and recognizes generic-MIME extensions", () => {
    expect(canPreviewImageArtifact("photo.avif", "application/octet-stream")).toBe(true);
    expect(canPreviewImageArtifact("scan.tiff", "application/octet-stream")).toBe(true);
    expect(canPreviewImageArtifact("animation.gif", "image/gif")).toBe(true);
    expect(canPreviewImageArtifact("photo.heic", "application/octet-stream")).toBe(false);
    expect(canPreviewImageArtifact("drawing.svg", "image/svg+xml")).toBe(false);
    expect(canPreviewImageArtifact("photo.png", "image/svg+xml")).toBe(false);
  });
});
