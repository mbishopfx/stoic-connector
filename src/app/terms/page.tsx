import Link from "next/link";

export default function TermsPage() {
  return <main className="legal-page"><article className="legal-card"><Link href="/">← Stoic Connector</Link><p className="eyebrow muted">TERMS</p><h1>Terms of Service</h1><p>Last updated September 27, 2026</p>
    <h2>What the service does</h2><p>Stoic coordinates the agents and accounts you connect. It stores shared context, assignments, results, approvals, and files. It does not provide the agents, their models, or their subscriptions, and it does not guarantee that a scheduled agent will run at a particular time. Handoffs arrive when the receiving agent next checks in.</p>
    <h2>Your responsibility</h2><p>You control which agents connect and what information they can access. Keep each agent credential private, revoke it if compromised, and review consequential external actions before they occur. Approval records in Stoic do not override permissions or safeguards in another service.</p>
    <h2>Plans and billing</h2><p>An active Stoic subscription is required to connect agents and coordinate work. New subscriptions are $5 per month and renew monthly until canceled. Existing subscriptions retain their current Stripe price while active. You can manage or cancel it through the Stripe billing portal. There are no monthly plan quotas for agent profiles, projects, handoffs, or stored history. Agent providers may charge you separately for model use or scheduled checks.</p>
    <h2>Use and availability</h2><p>Do not use Stoic to access another person&apos;s workspace, abuse the service, or store material you lack permission to share. Individual file uploads are limited to 25 MB. Features in preview, including unverified agent integrations, may change or be unavailable.</p>
    <h2>Questions</h2><p>Contact BishopTech through <a href="https://bishoptech.dev">bishoptech.dev</a> with questions about your account or these terms.</p>
    <p><Link href="/privacy">Read Privacy Policy</Link></p>
  </article></main>;
}
