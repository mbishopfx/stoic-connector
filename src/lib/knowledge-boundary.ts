import { z } from "zod";

export const KNOWLEDGE_SOURCE_SCOPES = ["brief", "decisions", "board", "handoffs", "artifacts", "agents"] as const;
export type KnowledgeSourceScope = (typeof KNOWLEDGE_SOURCE_SCOPES)[number];

const noteIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const scheduleSlotPattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const knowledgeSettingsInput = z.object({
  projectId: z.uuid(),
  enabled: z.boolean(),
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+./-]+$/),
  scheduleSlots: z.array(z.string().regex(scheduleSlotPattern)).min(1).max(6),
  sourceScopes: z.array(z.enum(KNOWLEDGE_SOURCE_SCOPES)).min(1).max(KNOWLEDGE_SOURCE_SCOPES.length),
  retentionDays: z.number().int().min(1).max(3650),
  pinnedNoteIds: z.array(z.string().regex(noteIdPattern)).max(100),
}).superRefine((value, context) => {
  if (new Set(value.scheduleSlots).size !== value.scheduleSlots.length) {
    context.addIssue({ code: "custom", path: ["scheduleSlots"], message: "Schedule slots must be unique." });
  }
  if (new Set(value.sourceScopes).size !== value.sourceScopes.length) {
    context.addIssue({ code: "custom", path: ["sourceScopes"], message: "Source scopes must be unique." });
  }
  if (new Set(value.pinnedNoteIds).size !== value.pinnedNoteIds.length) {
    context.addIssue({ code: "custom", path: ["pinnedNoteIds"], message: "Pinned note IDs must be unique." });
  }
});

export type KnowledgeSettingsInput = z.infer<typeof knowledgeSettingsInput>;

function escapeIlikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function knowledgeSearchPattern(value: string) {
  return `%${escapeIlikePattern(value.trim())}%`;
}
