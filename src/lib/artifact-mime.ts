export const SUPPORTED_ARTIFACT_MIME = new Set([
  "text/plain", "text/markdown", "text/csv", "text/tab-separated-values", "text/yaml", "text/xml", "text/html", "application/json", "application/yaml", "application/xml", "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/avif", "image/tiff", "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation",
  "application/rtf", "text/rtf", "application/x-rtf",
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/m4a",
  "video/mp4", "video/webm", "application/zip", "application/octet-stream",
]);

const TEXT_PREVIEW_MIME = new Set([
  "text/plain", "text/markdown", "text/csv", "text/tab-separated-values", "text/yaml", "text/xml", "text/html",
  "application/json", "application/yaml", "application/xml",
]);

const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "htm", "log", "out",
  "sql", "py", "js", "jsx", "ts", "tsx", "sh", "bash", "toml", "ini", "cfg", "conf", "css", "scss",
  "eml", "ics", "diff", "patch", "go", "rs", "java", "c", "h", "cc", "cpp", "hpp", "rb", "php",
  "swift", "kt", "r", "srt", "vtt", "ps1", "bat", "cmd", "makefile", "rtf",
]);

const NEVER_PREVIEW_EXTENSIONS = new Set(["env", "pem", "key", "p8", "p12", "pfx", "crt", "cer", "der", "keystore", "jks", "kdbx"]);
const IMAGE_PREVIEW_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/tiff", "image/gif"]);
const IMAGE_PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif", "tif", "tiff", "gif"]);

export function canPreviewImageArtifact(name: string, mimeType: string) {
  const fileName = name.split(/[\\/]/).at(-1)?.toLowerCase() || "";
  const extension = fileName.split(".").at(-1) || "";
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (IMAGE_PREVIEW_MIME.has(mime)) return true;
  if (mime && mime !== "application/octet-stream") return false;
  return IMAGE_PREVIEW_EXTENSIONS.has(extension);
}

export function canPreviewTextArtifact(name: string, mimeType: string) {
  const fileName = name.split(/[\\/]/).at(-1)?.toLowerCase() || "";
  const extension = fileName.split(".").at(-1) || "";
  if (fileName === ".env" || fileName.startsWith(".env.") || NEVER_PREVIEW_EXTENSIONS.has(extension)) return false;
  if (/^(?:credentials?|secrets?|private[-_]?key|id_rsa|id_ed25519|id_ecdsa)(?:\.|$)/i.test(fileName)) return false;
  return TEXT_PREVIEW_MIME.has(mimeType.toLowerCase()) || TEXT_PREVIEW_EXTENSIONS.has(extension);
}

export function safeArtifactMime(mimeType: string) {
  const declared = mimeType.split(";")[0];
  return SUPPORTED_ARTIFACT_MIME.has(declared) ? declared : "application/octet-stream";
}
