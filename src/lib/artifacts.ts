import { createHash } from "node:crypto";
import { adminDb, AppError } from "@/lib/supabase";
import { artifactInput } from "@/lib/validation";
import { requireWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";
import { canCompleteArtifact, canReadHandoff } from "@/lib/handoff-policy";

type Actor = { agent: AgentIdentity; userId?: never } | { agent?: never; userId: string };
const BUCKET = "stoic-artifacts";
const ALLOWED_MIME = new Set([
  "text/plain", "text/markdown", "text/csv", "application/json", "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function actorWorkspace(actor: Actor) {
  return actor.agent ? actor.agent.workspaceId : (await requireWorkspace(actor.userId)).id;
}

async function announceProjectArtifact(artifact: { id: string; handoff_id: string | null }) {
  if (artifact.handoff_id) return;
  const { error } = await adminDb().rpc("stoic_announce_project_artifact", { p_artifact_id: artifact.id });
  if (error) throw error;
}

export async function reserveArtifact(actor: Actor, input: unknown, contentDigest: string | null = null) {
  const parsed = artifactInput.parse(input);
  if (!ALLOWED_MIME.has(parsed.mimeType)) throw new AppError("This file type is not supported");
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  if (actor.agent && parsed.handoffId) {
    const { data: handoff, error: handoffError } = await db.from("handoffs")
      .select("assigned_agent_id,status").eq("workspace_id", workspaceId)
      .eq("project_id", parsed.projectId).eq("id", parsed.handoffId).maybeSingle();
    if (handoffError) throw handoffError;
    if (!handoff || !canReadHandoff(actor.agent, handoff)) throw new AppError("Handoff not found", 404);
  }
  const { data: artifact, error } = await db.rpc("stoic_reserve_artifact_v2", {
    p_workspace_id: workspaceId, p_project_id: parsed.projectId, p_handoff_id: parsed.handoffId || null,
    p_actor_agent_id: actor.agent?.agentId || null, p_actor_user_id: actor.userId || null,
    p_name: parsed.name, p_mime_type: parsed.mimeType, p_size_bytes: parsed.sizeBytes,
    p_idempotency_key: parsed.idempotencyKey || null, p_content_digest: contentDigest,
  });
  if (error) throw new AppError(error.message.replaceAll("_", " "), error.message.includes("subscription_required") || error.message.includes("quota") ? 402 : error.message.includes("forbidden") ? 403 : error.message.includes("idempotency_conflict") ? 409 : 400);
  const summary = { id: artifact.id, name: artifact.name, mime_type: artifact.mime_type, size_bytes: artifact.size_bytes, status: artifact.status, handoff_id: artifact.handoff_id };
  if (artifact.status === "deleted") throw new AppError("This file was deleted. Use a new idempotency key for a new upload.", 410);
  if (artifact.status === "ready") return { artifact: summary, uploadUrl: null, method: null, alreadyComplete: true };
  if (new Date(artifact.expires_at).getTime() < Date.now()) throw new AppError("Upload reservation expired. Retry with a new idempotency key.", 410);
  const signed = await db.storage.from(BUCKET).createSignedUploadUrl(artifact.storage_path, { upsert: false });
  if (signed.error) {
    if (!artifact.idempotent_replay) await db.from("artifacts").delete().eq("id", artifact.id);
    throw signed.error;
  }
  return { artifact: summary, uploadUrl: signed.data.signedUrl, method: "PUT", alreadyComplete: false };
}

export async function completeArtifact(actor: Actor, artifactId: string) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const { data: artifact, error: artifactError } = await db.from("artifacts")
    .select("id,project_id,name,mime_type,size_bytes,status,handoff_id,storage_path,expires_at,uploaded_by_agent_id")
    .eq("workspace_id", workspaceId).eq("id", artifactId).maybeSingle();
  if (artifactError) throw artifactError;
  if (!artifact) throw new AppError("Artifact not found", 404);
  if (actor.agent && !canCompleteArtifact(actor.agent, artifact)) throw new AppError("Artifact not found", 404);
  if (artifact.status === "deleted") throw new AppError("Artifact was deleted", 410);
  if (artifact.status === "ready") {
    await announceProjectArtifact(artifact);
    return { id: artifact.id, name: artifact.name, mime_type: artifact.mime_type, size_bytes: artifact.size_bytes, status: artifact.status, handoff_id: artifact.handoff_id };
  }
  if (new Date(artifact.expires_at).getTime() < Date.now()) throw new AppError("Upload reservation expired", 410);
  const info = await db.storage.from(BUCKET).info(artifact.storage_path);
  if (info.error || !info.data) throw new AppError("Upload has not completed", 409);
  if (info.data.size !== artifact.size_bytes || info.data.contentType !== artifact.mime_type) {
    await db.storage.from(BUCKET).remove([artifact.storage_path]);
    await db.from("artifacts").delete().eq("id", artifactId);
    throw new AppError("Uploaded file does not match the declared type or size", 409);
  }
  const { data, error } = await db.from("artifacts").update({ status: "ready", ready_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId).eq("id", artifactId).eq("status", "pending").select("id,name,mime_type,size_bytes,status,handoff_id").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await db.from("artifacts").select("id,name,mime_type,size_bytes,status,handoff_id")
      .eq("workspace_id", workspaceId).eq("id", artifactId).eq("status", "ready").maybeSingle();
    if (current.error) throw current.error;
    if (current.data) {
      await announceProjectArtifact(artifact);
      return current.data;
    }
    throw new AppError("Artifact could not be finalized", 409);
  }
  await db.from("audit_events").insert({ workspace_id: workspaceId, actor_key: actor.agent ? `agent:${actor.agent.agentId}` : `user:${actor.userId}`, action: "artifact.ready", object_id: artifactId });
  await announceProjectArtifact(artifact);
  return data;
}

export async function artifactDownload(actor: Actor, artifactId: string) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const { data: artifact, error: artifactError } = await db.from("artifacts").select("id,project_id,handoff_id,name,mime_type,size_bytes,storage_path")
    .eq("workspace_id", workspaceId).eq("id", artifactId).eq("status", "ready").maybeSingle();
  if (artifactError) throw artifactError;
  if (!artifact) throw new AppError("Artifact not found", 404);
  if (actor.agent && artifact.handoff_id) {
    const { data: handoff, error: handoffError } = await db.from("handoffs")
      .select("assigned_agent_id,status").eq("workspace_id", workspaceId)
      .eq("project_id", artifact.project_id).eq("id", artifact.handoff_id).maybeSingle();
    if (handoffError) throw handoffError;
    if (!handoff || !canReadHandoff(actor.agent, handoff)) throw new AppError("Artifact not found", 404);
  }
  const signed = await db.storage.from(BUCKET).createSignedUrl(artifact.storage_path, 300, { download: artifact.name });
  if (signed.error) throw signed.error;
  return { id: artifact.id, name: artifact.name, mimeType: artifact.mime_type, sizeBytes: artifact.size_bytes, downloadUrl: signed.data.signedUrl, expiresInSeconds: 300 };
}

export async function listProjectArtifacts(agent: AgentIdentity, projectId: string, offset = 0) {
  const db = adminDb();
  const { data: project, error: projectError } = await db.from("projects").select("id,name")
    .eq("workspace_id", agent.workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new AppError("Project not found", 404);
  const { data, error } = await db.from("artifacts")
    .select("id,name,mime_type,size_bytes,created_at")
    .eq("workspace_id", agent.workspaceId).eq("project_id", projectId)
    .is("handoff_id", null).eq("status", "ready")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + 99);
  if (error) throw error;
  return { project, artifacts: data || [], nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function deleteArtifact(ownerId: string, artifactId: string) {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  const { data: artifact, error: lookupError } = await db.from("artifacts")
    .select("id,storage_path,status").eq("workspace_id", workspace.id).eq("id", artifactId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!artifact) throw new AppError("File not found", 404);
  if (artifact.status === "deleted") return { id: artifact.id, status: "deleted", alreadyDeleted: true };
  if (artifact.status !== "ready") throw new AppError("File upload is not complete", 409);
  const removed = await db.storage.from(BUCKET).remove([artifact.storage_path]);
  if (removed.error) throw removed.error;
  const { data, error } = await db.rpc("stoic_mark_artifact_deleted", {
    p_workspace_id: workspace.id, p_owner_id: ownerId, p_artifact_id: artifactId,
  });
  if (error) throw error;
  return data;
}

export async function uploadTextArtifact(agent: AgentIdentity, input: { projectId: string; handoffId?: string; name: string; text: string; idempotencyKey: string }) {
  const bytes = new TextEncoder().encode(input.text);
  if (bytes.byteLength > 256 * 1024) throw new AppError("Text artifact exceeds 256 KB; use a signed upload URL");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const parsed = artifactInput.parse({ projectId: input.projectId, handoffId: input.handoffId, name: input.name, mimeType: "text/plain", sizeBytes: bytes.byteLength, idempotencyKey: input.idempotencyKey });
  const reserved = await reserveArtifact({ agent }, parsed, digest);
  if (reserved.artifact.status === "ready") return completeArtifact({ agent }, reserved.artifact.id);
  const { data: record } = await adminDb().from("artifacts").select("storage_path").eq("id", reserved.artifact.id).single();
  if (!record) throw new AppError("Artifact reservation was lost", 500);
  const path = record.storage_path;
  const storage = adminDb().storage.from(BUCKET);
  const upload = await storage.upload(path, bytes, { contentType: "text/plain", upsert: false });
  if (upload.error) {
    let matched = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const downloaded = await storage.download(path);
      if (downloaded.data) {
        const previousDigest = createHash("sha256").update(Buffer.from(await downloaded.data.arrayBuffer())).digest("hex");
        if (previousDigest !== digest) throw new AppError("Previous upload differs from this retry", 409);
        matched = true;
        break;
      }
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
    if (!matched) throw new AppError("The previous upload is still completing. Retry with the same idempotency key.", 409);
  }
  return completeArtifact({ agent }, reserved.artifact.id);
}
