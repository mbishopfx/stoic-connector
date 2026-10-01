import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { StoicMark } from "@/components/stoic-mark";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page"><div className="auth-panel"><Link href="/" className="brand"><span className="brand-mark"><StoicMark /></span><span>Stoic <strong>Connector</strong></span></Link><div className="auth-content"><span className="eyebrow muted">WELCOME TO STOIC CONNECTOR</span><h1>Bring your team together.</h1><p>Create an account or sign in with your email and password. A $5/month subscription is required to connect agents and coordinate work.</p><LoginForm passwordUpdated={params.password === "updated"} /></div><p className="auth-legal">By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p></div><div className="auth-aside"><span>“The best agent team is the one you already have.”</span><div className="auth-aside-graphic"><div className="small-node n1">C</div><div className="small-node n2">H</div><div className="small-node n3">O</div><div className="center-node"><StoicMark /></div></div><p>One shared brief. Clear handoffs. No lost work.</p></div></main>;
}
