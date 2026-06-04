import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../lib/logger';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-2',
  credentials: {
    // Note: falls back to hardcoded creds for local dev if env vars missing
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET || 'flowbill-invoices-prod';

export async function uploadInvoicePdf(invoiceId: string, pdfBuffer: Buffer): Promise<string> {
  const key = `invoices/${invoiceId}.pdf`;

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    }));

    logger.info('Invoice PDF uploaded', { invoiceId, key });
    return key;
  } catch (error) {
    logger.error('S3 upload failed:', { invoiceId, error });
    throw error;
  }
}

export async function getInvoicePdfUrl(invoiceId: string): Promise<string> {
  const key = `invoices/${invoiceId}.pdf`;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    logger.error('Failed to generate presigned URL:', { invoiceId, error });
    throw error;
  }
}
