import { adminDb, AppError } from "@/lib/supabase";
import { artifactInput } from "@/lib/validation";
import { requireWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";

type Actor = { agent: AgentIdentity; userId?: never } | { agent?: never; userId: string };
const BUCKET = "relay-artifacts";
const ALLOWED_MIME = new Set([
  "text/plain", "text/markdown", "text/csv", "application/json", "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function actorWorkspace(actor: Actor) {
  return actor.agent ? actor.agent.workspaceId : (await requireWorkspace(actor.userId)).id;
}

export async function reserveArtifact(actor: Actor, input: unknown) {
  const parsed = artifactInput.parse(input);
  if (!ALLOWED_MIME.has(parsed.mimeType)) throw new AppError("This file type is not supported");
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const { data: artifact, error } = await db.rpc("relay_reserve_artifact", {
    p_workspace_id: workspaceId, p_project_id: parsed.projectId, p_handoff_id: parsed.handoffId || null,
    p_actor_agent_id: actor.agent?.agentId || null, p_actor_user_id: actor.userId || null,
    p_name: parsed.name, p_mime_type: parsed.mimeType, p_size_bytes: parsed.sizeBytes,
  });
  if (error) throw new AppError(error.message.replaceAll("_", " "), error.message.includes("quota") ? 402 : error.message.includes("forbidden") ? 403 : 400);
  const signed = await db.storage.from(BUCKET).createSignedUploadUrl(artifact.storage_path, { upsert: false });
  if (signed.error) {
    await db.from("artifacts").delete().eq("id", artifact.id);
    throw signed.error;
  }
  return { artifact: { id: artifact.id, name: artifact.name, mime_type: artifact.mime_type, size_bytes: artifact.size_bytes, status: artifact.status }, uploadUrl: signed.data.signedUrl, method: "PUT" };
}

export async function completeArtifact(actor: Actor, artifactId: string) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const { data: artifact } = await db.from("artifacts").select("*").eq("workspace_id", workspaceId).eq("id", artifactId).maybeSingle();
  if (!artifact) throw new AppError("Artifact not found", 404);
  if (artifact.status === "ready") return artifact;
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
  if (!data) throw new AppError("Artifact could not be finalized", 409);
  await db.from("audit_events").insert({ workspace_id: workspaceId, actor_key: actor.agent ? `agent:${actor.agent.agentId}` : `user:${actor.userId}`, action: "artifact.ready", object_id: artifactId });
  return data;
}

export async function artifactDownload(actor: Actor, artifactId: string) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const { data: artifact } = await db.from("artifacts").select("id,name,mime_type,size_bytes,storage_path")
    .eq("workspace_id", workspaceId).eq("id", artifactId).eq("status", "ready").maybeSingle();
  if (!artifact) throw new AppError("Artifact not found", 404);
  const signed = await db.storage.from(BUCKET).createSignedUrl(artifact.storage_path, 300, { download: artifact.name });
  if (signed.error) throw signed.error;
  return { id: artifact.id, name: artifact.name, mimeType: artifact.mime_type, sizeBytes: artifact.size_bytes, downloadUrl: signed.data.signedUrl, expiresInSeconds: 300 };
}

export async function uploadTextArtifact(agent: AgentIdentity, input: { projectId: string; handoffId?: string; name: string; text: string }) {
  const bytes = new TextEncoder().encode(input.text);
  if (bytes.byteLength > 256 * 1024) throw new AppError("Text artifact exceeds 256 KB; use a signed upload URL");
  const parsed = artifactInput.parse({ projectId: input.projectId, handoffId: input.handoffId, name: input.name, mimeType: "text/plain", sizeBytes: bytes.byteLength });
  const reserved = await reserveArtifact({ agent }, parsed);
  const { data: record } = await adminDb().from("artifacts").select("storage_path").eq("id", reserved.artifact.id).single();
  if (!record) throw new AppError("Artifact reservation was lost", 500);
  const path = record.storage_path;
  const upload = await adminDb().storage.from(BUCKET).upload(path, bytes, { contentType: "text/plain", upsert: false });
  if (upload.error) throw upload.error;
  return completeArtifact({ agent }, reserved.artifact.id);
}
