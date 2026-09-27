import { createHash } from "node:crypto";
import { adminDb, AppError } from "@/lib/supabase";

export async function rateLimit(identity: string, maxPerMinute: number) {
  const actorHash = createHash("sha256").update(identity).digest("hex");
  const { data, error } = await adminDb().rpc("relay_rate_limit", { p_actor_hash: actorHash, p_limit: maxPerMinute });
  if (error) throw error;
  if (!data) throw new AppError("Too many requests. Try again in a minute.", 429);
}
