import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../lib/db';
import { logger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new AppError('Email, password, and name are required', 400);
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('User with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await query(
      'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [userId, email, passwordHash, name, 'user']
    );

    const token = jwt.sign(
      { id: userId, email, role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    logger.info('New user registered', { userId, email });

    res.status(201).json({
      user: { id: userId, email, name, role: 'user' },
      token,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Registration failed:', error);
    throw new AppError('Registration failed', 500);
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const result = await query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid credentials', 401);
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    logger.info('User logged in', { userId: user.id, email });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Login failed:', error);
    throw new AppError('Login failed', 500);
  }
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new AppError('Unauthorized', 401);

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    const result = await query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) throw new AppError('User not found', 404);

    res.json({ user: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid token', 401);
  }
});
