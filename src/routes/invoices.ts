import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../lib/db';
import { logger } from '../lib/logger';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const invoiceRouter = Router();

// All invoice routes require authentication
invoiceRouter.use(authenticate);

// List invoices for current user
invoiceRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let sql = 'SELECT * FROM invoices WHERE user_id = $1';
    const params: any[] = [req.user!.id];

    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM invoices WHERE user_id = $1' + (status ? ' AND status = $2' : ''),
      status ? [req.user!.id, status] : [req.user!.id]
    );

    res.json({
      invoices: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list invoices:', error);
    throw new AppError('Failed to retrieve invoices', 500);
  }
});

// Create new invoice
invoiceRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { customer_email, customer_name, items, due_date, notes } = req.body;

    if (!customer_email || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('customer_email and items are required', 400);
    }

    const invoiceId = uuidv4();
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unit_price);
    }, 0);
    const tax = subtotal * 0.20; // 20% VAT
    const total = subtotal + tax;

    await query(
      `INSERT INTO invoices (id, invoice_number, user_id, customer_email, customer_name, 
       items, subtotal, tax, total, status, due_date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [invoiceId, invoiceNumber, req.user!.id, customer_email, customer_name,
       JSON.stringify(items), subtotal, tax, total, 'draft', due_date, notes]
    );

    logger.info('Invoice created', { invoiceId, invoiceNumber, userId: req.user!.id, total });

    res.status(201).json({
      invoice: {
        id: invoiceId,
        invoice_number: invoiceNumber,
        customer_email,
        customer_name,
        items,
        subtotal,
        tax,
        total,
        status: 'draft',
        due_date,
        notes,
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Failed to create invoice:', error);
    throw new AppError('Failed to create invoice', 500);
  }
});

// Get single invoice
invoiceRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    res.json({ invoice: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to retrieve invoice', 500);
  }
});

// Update invoice status
invoiceRouter.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const result = await query(
      'UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found', 404);
    }

    logger.info('Invoice status updated', { invoiceId: req.params.id, status });

    res.json({ invoice: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to update invoice', 500);
  }
});

// Delete invoice (soft delete)
invoiceRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      "UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'draft' RETURNING id",
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invoice not found or cannot be deleted', 404);
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to delete invoice', 500);
  }
});
