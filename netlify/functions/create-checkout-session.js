import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  try {
    const url = process.env.SITE_URL || "https://localhost:8888";
    const params = new URLSearchParams(event.queryStringParameters);
    const plan = params.get("plan") || "1h";

    const prices = {
      "1h": process.env.STRIPE_PRICE_PACK_1H,
      "5h": process.env.STRIPE_PRICE_PACK_5H,
      "10h": process.env.STRIPE_PRICE_PACK_10H,
      "pass": process.env.STRIPE_PRICE_LEARNING_PASS,
    };

    const session = await stripe.checkout.sessions.create({
      mode: plan === "pass" ? "subscription" : "payment",
      line_items: [{ price: prices[plan], quantity: 1 }],
      success_url: `${url}?success=true`,
      cancel_url: `${url}?cancel=true`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
