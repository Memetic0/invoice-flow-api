import dotenv from 'dotenv';
import { query } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function seed() {
  console.log('Seeding database...');

  // Create tables
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY,
      invoice_number VARCHAR(50) UNIQUE NOT NULL,
      user_id UUID REFERENCES users(id),
      customer_email VARCHAR(255) NOT NULL,
      customer_name VARCHAR(255),
      items JSONB NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      tax DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      due_date DATE,
      notes TEXT,
      stripe_payment_intent_id VARCHAR(255),
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    )
  `);

  // Create demo user
  const userId = uuidv4();
  const passwordHash = await bcrypt.hash('demo123456', 12);

  await query(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING',
    [userId, 'admin@flowbill.io', passwordHash, 'Demo Admin', 'admin']
  );

  // Create sample invoices
  const invoices = [
    {
      customer: 'Acme Corp',
      email: 'billing@acme.example',
      items: [{ description: 'Web Development', quantity: 40, unit_price: 85 }],
      status: 'paid',
    },
    {
      customer: 'TechStart Ltd',
      email: 'accounts@techstart.example',
      items: [
        { description: 'API Integration', quantity: 1, unit_price: 2500 },
        { description: 'Support (monthly)', quantity: 1, unit_price: 500 },
      ],
      status: 'sent',
    },
    {
      customer: 'Design Studio',
      email: 'hello@designstudio.example',
      items: [{ description: 'Hosting (annual)', quantity: 1, unit_price: 1200 }],
      status: 'draft',
    },
  ];

  for (const inv of invoices) {
    const id = uuidv4();
    const number = `INV-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const tax = subtotal * 0.2;
    const total = subtotal + tax;

    await query(
      `INSERT INTO invoices (id, invoice_number, user_id, customer_email, customer_name, items, subtotal, tax, total, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + interval '30 days')
       ON CONFLICT (invoice_number) DO NOTHING`,
      [id, number, userId, inv.email, inv.customer, JSON.stringify(inv.items), subtotal, tax, total, inv.status]
    );
  }

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
