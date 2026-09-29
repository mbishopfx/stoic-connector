"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type AuthMode = "signup" | "signin";

function getSafeNext() {
  const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && new URL(next, window.location.origin).origin === window.location.origin ? next : "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
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
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const result = mode === "signup"
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : await client.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;
      if (result.data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
      setNotice(`Account created for ${email}. If email confirmation is enabled, check your inbox to finish signing in.`);
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
      <input id="password" type="password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      <button className="button" disabled={busy}>{busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}</button>
    </form>
    <p className="auth-mode-switch">{mode === "signup" ? "Already have an account?" : "New to Stoic Connector?"} <button type="button" className="text-link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setNotice(""); }}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>
  </>;
}
