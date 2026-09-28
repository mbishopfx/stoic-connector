import Stripe from "stripe";
import { appOrigin, requiredEnv } from "@/lib/config";
import { adminDb, AppError } from "@/lib/supabase";
import { requireWorkspace } from "@/lib/account";

function stripe() {
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
}

export async function createCheckout(ownerId: string) {
  const workspace = await requireWorkspace(ownerId);
  if (workspace.plan === "pro") throw new AppError("This workspace already has an active subscription. Open billing settings instead.", 409);
  const price = requiredEnv("STRIPE_PRO_MONTHLY_PRICE_ID");
  const priceDetails = await stripe().prices.retrieve(price);
  if (!priceDetails.active || priceDetails.currency !== "usd" || priceDetails.unit_amount !== 500 || priceDetails.recurring?.interval !== "month")
    throw new AppError("The configured Stoic subscription price does not match the published $5 monthly offer", 500);
  const db = adminDb();
  let customerId = workspace.stripe_customer_id as string | null;
  if (!customerId) {
    const { data: owner, error } = await db.auth.admin.getUserById(ownerId);
    if (error || !owner.user?.email) throw new AppError("Account email is required for billing");
    const customer = await stripe().customers.create({ email: owner.user.email, metadata: { workspaceId: workspace.id } });
    customerId = customer.id;
    const saved = await db.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspace.id).is("stripe_customer_id", null);
    if (saved.error) throw saved.error;
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: workspace.id,
    success_url: `${appOrigin()}/dashboard?billing=success`,
    cancel_url: `${appOrigin()}/dashboard?billing=cancelled`,
  });
  if (!session.url) throw new AppError("Checkout could not be started", 502);
  return { url: session.url };
}

export async function createBillingPortal(ownerId: string) {
  const workspace = await requireWorkspace(ownerId);
  if (!workspace.stripe_customer_id) throw new AppError("No billing account exists yet", 404);
  const session = await stripe().billingPortal.sessions.create({ customer: workspace.stripe_customer_id, return_url: `${appOrigin()}/dashboard` });
  return { url: session.url };
}

export async function handleStripeWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new AppError("Missing Stripe signature", 400);
  const event = stripe().webhooks.constructEvent(await request.text(), signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  const db = adminDb();
  const { data: alreadySeen } = await db.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (alreadySeen) return { duplicate: true };
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    // Query Stripe's current state so delayed webhooks cannot downgrade a
    // renewed subscription or overwrite a newer plan change.
    const subscriptions = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    const relayPrices = [requiredEnv("STRIPE_PRO_MONTHLY_PRICE_ID"), process.env.STRIPE_LEGACY_MONTHLY_PRICE_ID].filter(Boolean);
    const active = subscriptions.data.find((item) => item.status === "active"
      && item.items.data.some((entry) => relayPrices.includes(entry.price.id)));
    const { error } = await db.from("workspaces").update({ plan: active ? "pro" : "free", stripe_subscription_id: active?.id || null }).eq("stripe_customer_id", customerId);
    if (error) throw error;
  }
  const { error } = await db.from("stripe_events").insert({ id: event.id, event_type: event.type });
  if (error && error.code !== "23505") throw error;
  return { received: true };
}

export async function currentMonthlyPrice(subscriptionId: string | null) {
  if (!subscriptionId) return null;
  try {
    const subscription = await stripe().subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    return item?.price.currency === "usd" && item.price.recurring?.interval === "month"
      ? (item.price.unit_amount || 0) / 100 : null;
  } catch { return null; }
}
