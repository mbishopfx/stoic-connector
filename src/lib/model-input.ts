export function redactSensitiveText(value: string) {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]")
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s"']+/gi, "[database URL redacted]")
    .replace(/\b(?:sk-(?:proj-|ant-)?|sk_(?:live|test)_|rk_(?:live|test)_|whsec_|ghp_|gho_|ghu_|ghs_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{12,}/g, "[credential redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[token redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, "Bearer [credential redacted]")
    .replace(/\b(?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|password|private[_ -]?key)\s*(?:=|:|is)\s*["']?[^\s"',;]{6,}/gi, "[secret field redacted]");
}
