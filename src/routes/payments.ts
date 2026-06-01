import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../lib/db';
import { logger } from '../lib/logger';
import { createPaymentIntent, handleWebhookEvent } from '../services/stripe';

export const paymentRouter = Router();

// Create payment intent for an invoice
paymentRouter.post('/charge', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id } = req.body;

    if (!invoice_id) {
      throw new AppError('invoice_id is required', 400);
    }

    // Get invoice
    const invoiceResult = await query(
      'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
      [invoice_id, req.user!.id]
    );

    if (invoiceResult.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'paid') {
      throw new AppError('Invoice is already paid', 400);
    }

    // Create Stripe payment intent
    const paymentIntent = await createPaymentIntent({
      amount: Math.round(invoice.total * 100), // cents
      currency: 'gbp',
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        user_id: req.user!.id,
      },
    });

    // Store payment intent reference
    await query(
      'UPDATE invoices SET stripe_payment_intent_id = $1, updated_at = NOW() WHERE id = $2',
      [paymentIntent.id, invoice_id]
    );

    logger.info('Payment intent created', {
      invoiceId: invoice_id,
      paymentIntentId: paymentIntent.id,
      amount: invoice.total,
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: invoice.total,
      currency: 'gbp',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Payment creation failed:', error);
    throw new AppError('Failed to create payment', 500);
  }
});

// Stripe webhook handler
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const event = handleWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata.invoice_id;

        await query(
          "UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1",
          [invoiceId]
        );

        logger.info('Payment succeeded', { invoiceId, amount: paymentIntent.amount / 100 });
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        logger.warn('Payment failed', {
          invoiceId: paymentIntent.metadata.invoice_id,
          error: paymentIntent.last_payment_error?.message,
        });
        break;
      }

      default:
        logger.debug(`Unhandled webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Need express for raw body parsing in webhook
import express from 'express';
