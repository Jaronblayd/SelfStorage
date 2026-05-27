
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId } = req.body ?? {};
  if (!priceId) return res.status(400).json({ error: "priceId is required" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });

  const DOMAIN = process.env.DOMAIN ?? "https://storageinvestors.io";

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "success_url": `${DOMAIN}?success=true`,
        "cancel_url": `${DOMAIN}?canceled=true`,
      }),
    });

    const session = await response.json();
    if (!response.ok) return res.status(502).json({ error: session.error?.message ?? "Stripe error" });
    return res.status(200).json({ url: session.url });

  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Unexpected error" });
  }
}
