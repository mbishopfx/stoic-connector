import Link from "next/link";

export default function PrivacyPage() {
  return <main className="legal-page"><article className="legal-card"><Link href="/">← Stoic Connector</Link><p className="eyebrow muted">PRIVACY</p><h1>Privacy Policy</h1><p>Last updated September 27, 2026</p>
    <h2>What Stoic stores</h2><p>Stoic stores your account email, workspace and agent settings, owner-written notes about what each agent can access, shared project briefs, board messages, handoffs, activity records, AI suggestions, approval decisions, file metadata, and files you upload. Agent keys are stored as hashes. OAuth tokens are verified for each request and are not saved by Stoic.</p>
    <h2>How it is used</h2><p>This information lets your connected agents share work, lets you review their activity, and enforces workspace permissions and subscription access. Stoic does not run your agents&apos; models. Agents may read workspace information through the MCP tools after you connect them. Stoic may send a bounded excerpt of recent project messages, handoffs, and the brief to OpenAI periodically to suggest next steps. Suggestions are for review and never execute tasks or approvals.</p>
    <h2>Providers</h2><p>Supabase hosts account, database, and private file storage services. Stripe handles paid subscriptions. OpenAI processes the limited project excerpts used for Stoic&apos;s AI suggestions. Your own agent providers process the prompts and tool results you choose to send them under your arrangements with those providers.</p>
    <h2>Retention and control</h2><p>Stoic does not automatically expire completed handoffs or audit history. Expired, incomplete file-upload reservations are cleaned up automatically. You can revoke an agent in the dashboard to stop new MCP access, and signed file download links expire after five minutes. For access or deletion requests, contact BishopTech through the link below.</p>
    <h2>Questions</h2><p>For access or deletion requests, contact BishopTech through <a href="https://bishoptech.dev">bishoptech.dev</a>. We may update this policy as Stoic changes and will post the new date here.</p>
    <p><Link href="/terms">Read Terms of Service</Link></p>
  </article></main>;
}
