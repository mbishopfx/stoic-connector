export interface OAuthClaims {
  sub: string;
  client_id: string;
  exp: number;
}

/**
 * Validate the claims Supabase getClaims has already signature-verified.
 * Agent permissions are then derived from the owner-approved profile and its
 * current workspace role; Supabase's standard OIDC scopes do not authorize
 * Stoic database operations.
 */
export function hasValidOAuthClaims(
  value: unknown,
  expected: { issuer: string; audience: string; nowSeconds?: number },
): value is OAuthClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;
  const audience = claims.aud;
  const audienceMatches = audience === expected.audience
    || (Array.isArray(audience) && audience.includes(expected.audience));
  const nowSeconds = expected.nowSeconds ?? Math.floor(Date.now() / 1000);

  return claims.iss === expected.issuer
    && audienceMatches
    && typeof claims.sub === "string"
    && claims.sub.length > 0
    && typeof claims.client_id === "string"
    && claims.client_id.length > 0
    && typeof claims.exp === "number"
    && Number.isFinite(claims.exp)
    && claims.exp > nowSeconds;
}
