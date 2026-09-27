import Link from "next/link";

export default function PrivacyPage() {
  return <main className="legal-page"><article className="legal-card"><Link href="/">← BishopTech Relay</Link><p className="eyebrow muted">PRIVACY</p><h1>Privacy Policy</h1><p>Last updated September 26, 2026</p>
    <h2>What Relay stores</h2><p>Relay stores your account email, workspace and agent settings, shared project briefs, handoffs, activity records, approval decisions, file metadata, and files you upload. Agent keys are stored as hashes. OAuth tokens are verified for each request and are not saved by Relay.</p>
    <h2>How it is used</h2><p>This information lets your connected agents share work, lets you review their activity, and enforces workspace permissions, quotas, and billing. Relay does not run your agents&apos; models. Agents may read workspace information through the MCP tools after you connect them.</p>
    <h2>Providers</h2><p>Supabase hosts account, database, and private file storage services. Stripe handles paid subscriptions. Your own agent providers process the prompts and tool results you choose to send them under your arrangements with those providers.</p>
    <h2>Retention and control</h2><p>Closed handoff and audit history is retained for up to 30 days on Free or one year on Pro, then removed by scheduled cleanup. Active handoffs and uploaded files remain until they are removed through an account request or future self-service controls. You can revoke an agent in the dashboard to stop new MCP access. Signed file download links expire after five minutes.</p>
    <h2>Questions</h2><p>For access or deletion requests, contact BishopTech through <a href="https://bishoptech.dev">bishoptech.dev</a>. We may update this policy as Relay changes and will post the new date here.</p>
    <p><Link href="/terms">Read Terms of Service</Link></p>
  </article></main>;
}
