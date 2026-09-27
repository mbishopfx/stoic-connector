"use client";

import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && new URL(next, window.location.origin).origin === window.location.origin ? next : "/dashboard";
      const { error: signInError } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` } });
      if (signInError) throw signInError;
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the sign-in link");
    } finally { setBusy(false); }
  }

  if (sent) return <div className="auth-success"><strong>Check your inbox</strong><p>We sent a sign-in link to {email}. Open it on this device to continue.</p><button className="text-link" onClick={() => setSent(false)}>Use another email</button></div>;
  return <form className="login-form" onSubmit={submit}><label htmlFor="email">Email address</label><input id="email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}<ArrowRight size={18} /></button></form>;
}
