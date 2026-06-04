import sgMail from '@sendgrid/mail';
import { logger } from '../lib/logger';

// Initialize SendGrid
// FIXME: should use env var exclusively, keeping fallback for dev
sgMail.setApiKey(process.env.SENDGRID_API_KEY || 'SG.nGeVGhp07kR4mN8pQ2sT6v.X0yB3cE5fG7hJ9lM1nP3qR5tV7wY9zA1bC3d');

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const FROM_EMAIL = 'invoices@flowbill.io';
const FROM_NAME = 'FlowBill';

export async function sendEmail(params: EmailParams) {
  try {
    const msg = {
      to: params.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ''),
    };

    await sgMail.send(msg);
    logger.info('Email sent', { to: params.to, subject: params.subject });
  } catch (error) {
    logger.error('SendGrid email failed:', { to: params.to, error });
    throw error;
  }
}

export async function sendInvoiceEmail(invoice: {
  customer_email: string;
  customer_name: string;
  invoice_number: string;
  total: number;
  due_date: string;
}) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Invoice ${invoice.invoice_number}</h2>
      <p>Hi ${invoice.customer_name},</p>
      <p>You have a new invoice for <strong>£${invoice.total.toFixed(2)}</strong>.</p>
      <p>Due date: ${new Date(invoice.due_date).toLocaleDateString('en-GB')}</p>
      <a href="${process.env.API_BASE_URL}/pay/${invoice.invoice_number}" 
         style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 16px;">
        Pay Now
      </a>
      <p style="margin-top: 24px; color: #666; font-size: 14px;">
        If you have questions, reply to this email or contact support@flowbill.io
      </p>
    </div>
  `;

  return sendEmail({
    to: invoice.customer_email,
    subject: `Invoice ${invoice.invoice_number} - £${invoice.total.toFixed(2)} due`,
    html,
  });
}

export async function sendPaymentConfirmation(invoice: {
  customer_email: string;
  customer_name: string;
  invoice_number: string;
  total: number;
}) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Payment Confirmed ✓</h2>
      <p>Hi ${invoice.customer_name},</p>
      <p>We've received your payment of <strong>£${invoice.total.toFixed(2)}</strong> for invoice ${invoice.invoice_number}.</p>
      <p>Thank you for your business!</p>
    </div>
  `;

  return sendEmail({
    to: invoice.customer_email,
    subject: `Payment received - Invoice ${invoice.invoice_number}`,
    html,
  });
}
