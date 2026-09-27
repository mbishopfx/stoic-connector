import Link from "next/link";

export default function TermsPage() {
  return <main className="legal-page"><article className="legal-card"><Link href="/">← BishopTech Relay</Link><p className="eyebrow muted">TERMS</p><h1>Terms of Service</h1><p>Last updated September 26, 2026</p>
    <h2>What the service does</h2><p>Relay coordinates the agents and accounts you connect. It stores shared context, assignments, results, approvals, and files. It does not provide the agents, their models, or their subscriptions, and it does not guarantee that a scheduled agent will run at a particular time. Handoffs arrive when the receiving agent next checks in.</p>
    <h2>Your responsibility</h2><p>You control which agents connect and what information they can access. Keep each agent credential private, revoke it if compromised, and review consequential external actions before they occur. Approval records in Relay do not override permissions or safeguards in another service.</p>
    <h2>Plans and billing</h2><p>Free and Pro limits are shown on the pricing page and in your dashboard. Pro is billed through Stripe at the price shown at checkout. You can manage or cancel a subscription through the billing portal. Agent providers may charge you separately for model use or scheduled checks.</p>
    <h2>Use and availability</h2><p>Do not use Relay to access another person&apos;s workspace, abuse the service, or store material you lack permission to share. We may apply rate and storage limits to protect the service. Features in preview, including unverified agent integrations, may change or be unavailable.</p>
    <h2>Questions</h2><p>Contact BishopTech through <a href="https://bishoptech.dev">bishoptech.dev</a> with questions about your account or these terms.</p>
    <p><Link href="/privacy">Read Privacy Policy</Link></p>
  </article></main>;
}
