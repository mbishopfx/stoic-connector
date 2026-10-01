"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { recoveryRedirectOrigin } from "@/lib/password-recovery";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const origin = recoveryRedirectOrigin(process.env.NEXT_PUBLIC_APP_URL, window.location.origin);
      const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/recovery`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch {
      setError("We couldn’t send the reset email right now. Check the address and try again in a few minutes.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <div className="auth-success" role="status">
      <strong>Check your inbox</strong>
      <p>If an account exists for {email}, Stoic has sent a password reset link. The link will return you to Stoic to choose a new password.</p>
      <Link className="text-link" href="/login">Back to sign in</Link>
    </div>;
  }

  return <>
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="recovery-email">Email address</label>
      <input id="recovery-email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>
    <p className="auth-mode-switch"><Link className="text-link" href="/login">Back to sign in</Link></p>
  </>;
}
