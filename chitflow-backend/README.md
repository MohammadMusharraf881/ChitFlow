# ChitFlow Backend

Node.js + Express REST API foundation for ChitFlow.

## Current backend scope

Implemented now:

- Express server
- PostgreSQL connection through `pg`
- Environment configuration with `.env`
- Helmet security headers
- CORS configuration
- REST health endpoint
- User registration
- Password hashing with bcrypt
- Login
- JWT authentication
- `/api/auth/me`
- Role information in authenticated sessions
- Basic audit logging for registration and login
- Database schema foundation

The frontend can continue running in mock mode while the remaining business modules are migrated incrementally.

## Architecture

Browser
→ HTML/CSS/Vanilla JS
→ REST API
→ Node.js + Express
→ PostgreSQL

The current frontend `js/api.js` already uses the same `{ success, data }` response envelope and REST route style.

## Run locally

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy:

```text
.env.example
```

to:

```text
.env
```

Set the PostgreSQL connection string and a strong JWT secret.

### 3. Create the database

Create a PostgreSQL database named:

```text
chitflow
```

Then run:

```bash
npm run db:init
```

### 4. Add demo users

```bash
npm run db:seed
```

Demo accounts:

```text
Organizer: organizer@chitflow.test / demo-password
Member: member@chitflow.test / demo-password
```

### 5. Start the server

Development:

```bash
npm run dev
```

Normal:

```bash
npm start
```

The API will run at:

```text
http://localhost:5000
```

Health check:

```text
GET /api/health
```

## Authentication endpoints

### Register

```text
POST /api/auth/register
```

Body:

```json
{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "password": "password123",
  "role": "member"
}
```

### Login

```text
POST /api/auth/login
```

Body:

```json
{
  "email": "rahul@example.com",
  "password": "password123"
}
```

The response returns a JWT token.

### Current user

```text
GET /api/auth/me
Authorization: Bearer <token>
```

## Important development note

This backend is intentionally introduced before the rest of the business modules are migrated.

The project is therefore **backend-ready**, not falsely presented as a fully migrated production system.

The next modules can be moved one by one:

1. Payouts
2. Transactions
3. Disputes
4. Membership history
5. Audit log expansion
6. Notifications
7. Reports
8. Settings/Profile
9. Remaining REST API migration
10. PostgreSQL relationships and transactions
11. Production authentication/security hardening
