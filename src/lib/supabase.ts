import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { appOrigin, requiredEnv } from "@/lib/config";

export function adminDb() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function authClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function serverAuth() {
  const store = await cookies();
  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Server Components cannot write cookies; auth callback and API routes can.
          }
        },
      },
    },
  );
}

export async function currentUser() {
  const client = await serverAuth();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AppError("Sign in is required", 401);
  return data.user;
}

export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function responseError(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "An unexpected error occurred" }, { status: 500 });
}

export function assertSameOrigin(
  request: Request,
  expectedContentType: "application/json" | "multipart/form-data" = "application/json",
) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appOrigin()) throw new AppError("Invalid request origin", 403);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== expectedContentType) {
    const message = expectedContentType === "application/json" ? "JSON required" : "Multipart form data required";
    throw new AppError(message, 415);
  }
}
