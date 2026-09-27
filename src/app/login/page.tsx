import Link from "next/link";
import { CircleDot } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="auth-page"><div className="auth-panel"><Link href="/" className="brand"><span className="brand-mark"><CircleDot size={20} /></span><span>BishopTech <strong>Relay</strong></span></Link><div className="auth-content"><span className="eyebrow muted">WELCOME TO RELAY</span><h1>Bring your team together.</h1><p>Enter your email and we’ll send a secure sign-in link. Your workspace will be ready in a moment.</p><LoginForm /></div><p className="auth-legal">By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p></div><div className="auth-aside"><span>“The best agent team is the one you already have.”</span><div className="auth-aside-graphic"><div className="small-node n1">C</div><div className="small-node n2">H</div><div className="small-node n3">O</div><div className="center-node"><CircleDot size={32} /></div></div><p>One shared brief. Clear handoffs. No lost work.</p></div></main>;
}
