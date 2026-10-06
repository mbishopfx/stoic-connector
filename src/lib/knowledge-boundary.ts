import { z } from "zod";
import { KNOWLEDGE_CONFIDENCE, KNOWLEDGE_STATUSES } from "./knowledge";

export const KNOWLEDGE_SOURCE_SCOPES = ["brief", "decisions", "board", "handoffs", "artifacts", "agents"] as const;
export type KnowledgeSourceScope = (typeof KNOWLEDGE_SOURCE_SCOPES)[number];

const noteIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const scheduleSlotPattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const knowledgeSettingsInput = z.object({
  projectId: z.uuid(),
  enabled: z.boolean(),
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+./-]+$/).refine(isValidTimeZone, "Choose a recognized time zone."),
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

export const ownerKnowledgeNoteInput = z.object({
  projectId: z.uuid(),
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["decision", "agent_profile", "handoff", "artifact", "question", "note"]),
  status: z.enum(KNOWLEDGE_STATUSES),
  confidence: z.enum(KNOWLEDGE_CONFIDENCE),
  body: z.string().trim().min(1).max(24_000),
});

const diaryLine = z.string().trim().min(1).max(1000);

export const agentDiaryInput = z.object({
  projectId: z.uuid(),
  importantThreads: z.array(z.object({
    messageId: z.uuid(),
    summary: z.string().trim().min(1).max(500),
  }).strict()).max(8).default([]),
  workDone: z.array(diaryLine).max(8).default([]),
  feelings: z.string().trim().max(500).default(""),
  expectations: z.string().trim().max(1000).default(""),
  predictions: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  blockers: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  handoffIds: z.array(z.uuid()).max(8).default([]),
}).strict().superRefine((value, context) => {
  if (new Set(value.importantThreads.map((item) => item.messageId)).size !== value.importantThreads.length) {
    context.addIssue({ code: "custom", path: ["importantThreads"], message: "Each important thread must use a distinct project message." });
  }
  if (new Set(value.handoffIds).size !== value.handoffIds.length) {
    context.addIssue({ code: "custom", path: ["handoffIds"], message: "Handoff references must be unique." });
  }
  if (!value.importantThreads.length && !value.workDone.length && !value.feelings && !value.expectations && !value.predictions.length && !value.blockers.length) {
    context.addIssue({ code: "custom", message: "Add at least one useful reflection field." });
  }
});

export type KnowledgeSettingsInput = z.infer<typeof knowledgeSettingsInput>;

function escapeIlikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function knowledgeSearchPattern(value: string) {
  return `%${escapeIlikePattern(value.trim())}%`;
}
