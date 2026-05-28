import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { AuthRequest } from './auth';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitConfig {
  free: { maxRequests: number; windowMs: number };
  pro: { maxRequests: number; windowMs: number };
  enterprise: { maxRequests: number; windowMs: number };
}

const LIMITS: RateLimitConfig = {
  free: { maxRequests: 20, windowMs: 60_000 },        // 20 req/min
  pro: { maxRequests: 100, windowMs: 60_000 },        // 100 req/min
  enterprise: { maxRequests: 500, windowMs: 60_000 }, // 500 req/min
};

/**
 * Per-user rate limiting backed by Redis.
 * Uses a sliding window counter per user ID.
 * Falls back to IP-based limiting for unauthenticated requests.
 */
export function perUserRateLimit(req: AuthRequest, res: Response, next: NextFunction) {
  const user = req.user;
  const plan = (user?.role as keyof RateLimitConfig) || 'free';
  const identifier = user?.id || req.ip || 'anonymous';
  const config = LIMITS[plan] || LIMITS.free;

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  redis
    .multi()
    .zremrangebyscore(key, 0, windowStart)
    .zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2)}`)
    .zcard(key)
    .expire(key, Math.ceil(config.windowMs / 1000))
    .exec()
    .then((results) => {
      if (!results) return next();

      const requestCount = results[2][1] as number;
      const remaining = Math.max(0, config.maxRequests - requestCount);

      res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + config.windowMs) / 1000).toString());

      if (requestCount > config.maxRequests) {
        logger.warn('Rate limit exceeded', { identifier, plan, requestCount });
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(config.windowMs / 1000),
        });
      }

      next();
    })
    .catch((err) => {
      logger.error('Rate limiter Redis error:', err);
      // Fail open — don't block requests if Redis is down
      next();
    });
}
