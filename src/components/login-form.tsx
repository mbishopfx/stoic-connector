"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";

function getSafeNext() {
  const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && new URL(next, window.location.origin).origin === window.location.origin ? next : "/dashboard";
}

export function LoginForm({ passwordUpdated = false }: { passwordUpdated?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(passwordUpdated ? "Your password has been updated. Sign in with your new password." : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const next = getSafeNext();
      const result = await client.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;
      if (result.data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not authenticate your account");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
      <Link className="auth-forgot-link" href="/forgot-password">Forgot password?</Link>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      <button className="button" disabled={busy}>{busy ? "Working…" : "Sign in"}</button>
    </form>
    <p className="auth-mode-switch">New to Stoic? <a className="text-link" href="https://github.com/mbishopfx/stoic-connector">Self-host from the source</a> or <a className="text-link" href="https://www.bishoptech.dev/contact">ask BishopTech to set it up</a>.</p>
  </>;
}
