import { getStripe } from "./client";

export async function createCheckoutSession(params: {
  priceId: string;
  customerId?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ url: string | null; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: params.priceId, quantity: 1 }],
    ...(params.customerId ? { customer: params.customerId } : {}),
    success_url: params.successUrl ?? `${process.env["PUBLIC_API_URL"] ?? "http://localhost:3000"}/billing?success=true`,
    cancel_url: params.cancelUrl ?? `${process.env["PUBLIC_API_URL"] ?? "http://localhost:3000"}/pricing`,
  });
  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(params: {
  customerId: string;
  returnUrl?: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl ?? `${process.env["PUBLIC_API_URL"] ?? "http://localhost:3000"}/billing`,
  });
  return { url: session.url };
}
