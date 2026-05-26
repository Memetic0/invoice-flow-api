# invoice-flow-api

Backend API for the FlowBill invoicing platform. Handles invoice creation, payment processing via Stripe, email notifications via SendGrid, and file storage on AWS S3.

## Quick Start

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env` for configuration. The following services are required:

- **PostgreSQL** — main database
- **Redis** — caching and rate limiting
- **Stripe** — payment processing (live keys in `.env`)
- **SendGrid** — transactional email
- **AWS S3** — invoice PDF storage

## Stack

- Node.js 18+ / TypeScript
- Express.js
- PostgreSQL + pg driver
- Stripe SDK
- SendGrid Mail
- AWS SDK (S3)
- Redis (ioredis)
- JWT authentication
- Docker Compose for local dev

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/register | Register user |
| POST | /api/v1/auth/login | Login, returns JWT |
| GET | /api/v1/invoices | List invoices (paginated) |
| POST | /api/v1/invoices | Create invoice |
| GET | /api/v1/invoices/:id | Get invoice |
| PATCH | /api/v1/invoices/:id/status | Update status |
| POST | /api/v1/payments/charge | Create payment intent |
| POST | /api/v1/payments/webhook | Stripe webhook |

## Deployment

Deployed via GitHub Actions to Railway. See `.github/workflows/deploy.yml`.

Database hosted on Railway managed PostgreSQL.
Redis on Upstash.
File storage on AWS S3 (eu-west-2).

## Development

```bash
docker-compose up -d    # start postgres + redis
npm run seed            # seed sample data
npm run dev             # start dev server
```

## License

UNLICENSED - Private
