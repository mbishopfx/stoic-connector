import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { StoicMark } from "@/components/stoic-mark";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page"><div className="auth-panel"><Link href="/" className="brand"><span className="brand-mark"><StoicMark /></span><span>Stoic <strong>Connector</strong></span></Link><div className="auth-content"><span className="eyebrow muted">ACCOUNT ACCESS</span><h1>Reset your password.</h1><p>Enter the email address for your Stoic account. We’ll send a secure link to choose a new password.</p>{params.error === "invalid_link" && <p className="form-error" role="alert">That reset link is invalid or has expired. Request a new one below.</p>}<ForgotPasswordForm /></div><p className="auth-legal">Need help? Contact <a href="mailto:support@bishoptech.dev">support@bishoptech.dev</a>.</p></div><div className="auth-aside"><span>“A clear path back to your work.”</span><div className="auth-aside-graphic"><div className="small-node n1">C</div><div className="small-node n2">H</div><div className="small-node n3">O</div><div className="center-node"><StoicMark /></div></div><p>Your shared brief and agent team will be waiting.</p></div></main>;
}
