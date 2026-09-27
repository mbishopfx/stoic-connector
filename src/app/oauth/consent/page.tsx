import { redirect } from "next/navigation";
import { serverAuth } from "@/lib/supabase";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const authorizationId = (await searchParams).authorization_id;
  if (!authorizationId) return <main className="simple-page"><h1>Missing authorization request</h1></main>;
  const supabase = await serverAuth();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return <main className="simple-page"><h1>Authorization request expired</h1><p>Please reconnect from your agent.</p></main>;
  if (!("authorization_id" in details)) redirect(details.redirect_url);
  return <main className="consent-page"><div className="consent-card"><span className="eyebrow muted">CONNECT AN AGENT</span><h1>Allow {details.client.name} to connect?</h1><p>This app can use Relay’s MCP tools after you pair it with an agent profile in your dashboard. It can then read shared project context and create or update work according to that profile’s role.</p><div className="consent-detail"><span>Redirects to</span><strong>{details.redirect_uri}</strong></div><div className="consent-detail"><span>Requested account scopes</span><strong>{details.scope || "Basic account access"}</strong></div><p className="fine-print">Only approve clients you recognize. You can revoke the agent profile and its access from Relay at any time.</p><form action="/api/oauth/decision" method="POST"><input type="hidden" name="authorization_id" value={authorizationId} /><button className="button" name="decision" value="approve">Allow connection</button><button className="button button-outline" name="decision" value="deny">Deny</button></form></div></main>;
}
