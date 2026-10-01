"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "Could not update your password. Request a new reset link and try again.");
      }
      router.replace("/login?password=updated");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password. Request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="new-password">New password</label>
      <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? "Updating…" : "Save new password"}</button>
    </form>
    <p className="auth-mode-switch"><Link className="text-link" href="/forgot-password">Request a new reset link</Link></p>
  </>;
}
