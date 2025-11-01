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
      return { statusCode: 400, body: "Unknown plan" };
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan === "pass" ? "subscription" : "payment",
      line_items: [{ price: priceMap[plan], quantity: 1 }],
      success_url: `${process.env.SITE_URL}?purchase=success`,
      cancel_url: `${process.env.SITE_URL}?purchase=cancel`
    });

    // ⬇️ Server-side redirect – <a href="/.netlify/functions/..."> veiks kaip reikia
    return {
      statusCode: 302,
      headers: { Location: session.url },
      body: ""
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
