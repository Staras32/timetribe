const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // NE anon!
);

exports.handler = async (event) => {
  try {
    const sig = event.headers['stripe-signature'];
    const body = event.body;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const plan = session.metadata?.plan;
      const userId = session.client_reference_id || session.metadata?.user_id || null; // jei pridėsi
      const creditsByPlan = { '1h': 1, '5h': 5, '10h': 10 };

      if (plan && creditsByPlan[plan] && userId) {
        const credits = creditsByPlan[plan];
        await supabase.rpc('increment_purchased', { p_user: userId, p_credits: credits });
        await supabase.from('transactions').insert({
          user_id: userId,
          type: 'purchase',
          credits,
          amount_eur: session.amount_total ? session.amount_total / 100 : null,
          meta: { plan }
        });
      }
    }

    if (stripeEvent.type === 'invoice.payment_succeeded') {
      const invoice = stripeEvent.data.object;
      const sub = invoice.lines?.data?.[0];
      const userId = sub?.metadata?.user_id || null;
      if (userId) {
        await supabase.from('wallets').update({
          pass_active: true,
          pass_reset_at: new Date(Date.now() + 1000*60*60*24*30).toISOString()
        }).eq('user_id', userId);
      }
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};
