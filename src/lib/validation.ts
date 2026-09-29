import { z } from "zod";

export const uuid = z.uuid();
export const idempotencyKey = z.string().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
export const workspaceInput = z.object({ name: z.string().trim().min(2).max(80) });
export const agentInput = z.object({
  name: z.string().trim().min(2).max(80),
  platform: z.enum(["codex", "hermes", "openclaw", "grok", "muse", "other"]),
});
export const projectInput = z.object({ name: z.string().trim().min(2).max(100) });
export const handoffInput = z.object({
  projectId: uuid,
  assignedAgentId: uuid.optional(),
  teamQueue: z.boolean().default(false),
  title: z.string().trim().min(3).max(160),
  goal: z.string().trim().min(10).max(10000),
  constraints: z.string().trim().max(10000).default(""),
  idempotencyKey: idempotencyKey.optional(),
}).refine((value) => !(value.teamQueue && value.assignedAgentId), "Choose either one assigned worker or the team queue");
export const handoffActionInput = z.object({
  handoffId: uuid,
  action: z.enum(["claim", "update", "block", "submit", "accept", "request_changes", "approve_assignment", "cancel"]),
  body: z.string().trim().max(20000).default(""),
  idempotencyKey: idempotencyKey.optional(),
});
export const artifactInput = z.object({
  projectId: uuid,
  handoffId: uuid.optional(),
  name: z.string().trim().min(1).max(180).regex(/^[^/\\\x00-\x1f]+$/),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
  idempotencyKey: idempotencyKey.optional(),
});
