export function redactSynthesisSecrets(value: string) {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]")
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s"']+/gi, "[database URL redacted]")
    .replace(/\b(?:sk-(?:proj-|ant-)?|sk_(?:live|test)_|rk_(?:live|test)_|whsec_|ghp_|gho_|ghu_|ghs_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{12,}/g, "[credential redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[token redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, "Bearer [credential redacted]")
    .replace(/\b(?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|password|private[_ -]?key)\s*(?:=|:|is)\s*["']?[^\s"',;]{6,}/gi, "[secret field redacted]");
}

export function buildSynthesisInput(project: { id: string; name: string; brief: string }, messages: { id: string; author_key: string; kind: string; body: string; created_at: string }[], handoffs: { id: string; title: string; goal: string; status: string; updated_at: string }[], events: { id: string; handoff_id: string; event_type: string; body: string; created_at: string }[]) {
  return JSON.stringify({
    project: { id: project.id, name: redactSynthesisSecrets(project.name).slice(0, 160), brief: redactSynthesisSecrets(project.brief).slice(0, 4000) },
    messages: messages.slice(0, 20).map((item) => ({ id: item.id, author: item.author_key, kind: item.kind, at: item.created_at, body: redactSynthesisSecrets(item.body).slice(0, 500) })),
    handoffs: handoffs.slice(0, 20).map((item) => ({ id: item.id, title: redactSynthesisSecrets(item.title).slice(0, 160), goal: redactSynthesisSecrets(item.goal).slice(0, 300), status: item.status, at: item.updated_at })),
    events: events.slice(0, 30).map((item) => ({ id: item.id, handoffId: item.handoff_id, type: item.event_type, body: redactSynthesisSecrets(item.body).slice(0, 500), at: item.created_at })),
  });
}
