const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; charset=utf-8",
};

export async function GET() {
  const challenge = process.env.OPENAI_APP_VERIFICATION_CHALLENGE?.trim();
  if (!challenge) {
    return new Response("Challenge is not configured", {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  return new Response(challenge, { headers: noStoreHeaders });
}
