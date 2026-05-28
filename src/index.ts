import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { logger } from './lib/logger';
import { authRouter } from './routes/auth';
import { invoiceRouter } from './routes/invoices';
import { paymentRouter } from './routes/payments';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { perUserRateLimit } from './middleware/rateLimiter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Global rate limiting (fallback)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Per-user rate limiting (Redis-backed, plan-aware)
app.use('/api/', perUserRateLimit);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.3.1', uptime: process.uptime() });
});

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/invoices', invoiceRouter);
app.use('/api/v1/payments', paymentRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

export default app;
