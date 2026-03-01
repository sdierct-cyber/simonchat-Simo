const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async () => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999, // $9.99
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
