import Stripe from "stripe";

export const handler = async (event) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const plan = (event.queryStringParameters && event.queryStringParameters.plan) || "1h";

    const priceMap = {
      "1h": process.env.STRIPE_PRICE_PACK_1H,
      "5h": process.env.STRIPE_PRICE_PACK_5H,
      "10h": process.env.STRIPE_PRICE_PACK_10H,
      "pass": process.env.STRIPE_PRICE_LEARNING_PASS,
    };

    if (!priceMap[plan]) {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown plan" }) };
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan === "pass" ? "subscription" : "payment",
      line_items: [{ price: priceMap[plan], quantity: 1 }],
      success_url: `${process.env.SITE_URL || ""}?purchase=success`,
      cancel_url: `${process.env.SITE_URL || ""}?purchase=cancel`
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
