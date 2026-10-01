import Link from "next/link";
import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { StoicMark } from "@/components/stoic-mark";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/password-recovery";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const recoverySession = (await cookies()).get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  return <main className="auth-page"><div className="auth-panel"><Link href="/" className="brand"><span className="brand-mark"><StoicMark /></span><span>Stoic <strong>Connector</strong></span></Link><div className="auth-content"><span className="eyebrow muted">ACCOUNT ACCESS</span><h1>Choose a new password.</h1>{recoverySession ? <><p>Use a password you haven’t used for Stoic before.</p><ResetPasswordForm /></> : <><p>Open a valid password reset link from your email to set a new password.</p><Link className="button" href="/forgot-password">Request a reset link</Link></>}</div><p className="auth-legal"><Link href="/login">Back to sign in</Link></p></div><div className="auth-aside"><span>“A clear path back to your work.”</span><div className="auth-aside-graphic"><div className="small-node n1">C</div><div className="small-node n2">H</div><div className="small-node n3">O</div><div className="center-node"><StoicMark /></div></div><p>Your shared brief and agent team will be waiting.</p></div></main>;
}
