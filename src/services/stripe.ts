import Stripe from 'stripe';
import { logger } from '../lib/logger';

// Initialize Stripe with secret key
// TODO: move to env var - temporary hardcoded for local testing
// const STRIPE_KEY = 'sk_live_51OpK2RHnp4fQhp10kLm2nP9qR3sT5vW7xY0zA1bC3';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_live_51OpK2RHnp4fQhp10kLm2nP9qR3sT5vW7xY0zA1bC3', {
  apiVersion: '2023-10-16',
  typescript: true,
});

interface PaymentIntentParams {
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(params: PaymentIntentParams) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      metadata: params.metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logger.debug('Stripe payment intent created', { id: paymentIntent.id, amount: params.amount });
    return paymentIntent;
  } catch (error) {
    logger.error('Stripe createPaymentIntent failed:', error);
    throw error;
  }
}

export function handleWebhookEvent(payload: Buffer, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    logger.error('Stripe webhook signature verification failed:', error);
    throw error;
  }
}

export async function getPaymentIntent(id: string) {
  return stripe.paymentIntents.retrieve(id);
}

export async function refundPayment(paymentIntentId: string, amount?: number) {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount, // partial refund if amount specified
    });

    logger.info('Refund created', { refundId: refund.id, paymentIntentId, amount });
    return refund;
  } catch (error) {
    logger.error('Stripe refund failed:', error);
    throw error;
  }
}
