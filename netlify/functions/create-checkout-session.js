const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const plan = url.searchParams.get('plan'); // '1h' | '5h' | '10h' | 'pass'
    const priceMap = {
      '1h': process.env.STRIPE_PRICE_PACK_1H,
      '5h': process.env.STRIPE_PRICE_PACK_5H,
      '10h': process.env.STRIPE_PRICE_PACK_10H,
      'pass': process.env.STRIPE_PRICE_LEARNING_PASS,
    };
    if (!priceMap[plan]) return { statusCode: 400, body: 'Unknown plan' };

    const isSub = plan === 'pass';
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: [{ price: priceMap[plan], quantity: 1 }],
      success_url: `${process.env.SITE_URL}/?purchase=success`,
      cancel_url: `${process.env.SITE_URL}/?purchase=cancel`,
      metadata: { plan },
    });

    return { statusCode: 302, headers: { Location: session.url }, body: '' };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
