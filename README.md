# BusNest — Bus Booking Management System

A full-stack, database-backed bus booking platform built for the ALGIONS AI LABS Full-Stack Web Development Internship assessment.

- **Passengers** search trips with time-of-day, bus-type, price and rating filters, pick exact seats in an inline seat drawer (lower/upper decks, ladies-only seats), check out in a slide-over with promo codes, get a QR boarding pass with a unique PNR, and cancel with a refund preview.
- **Operators** see only their own buses, routes, trips, bookings, passenger manifests, occupancy and refunds, and can schedule trips and change fares.
- **Admins** manage operators, users, buses and seat layouts, stops, routes, trips and fares, and see network-wide bookings, cancellations, reports and an audit log.

The core engineering guarantee: **two people can never be sold the same seat on the same trip**, enforced by a MongoDB partial unique index and proven by concurrent tests. See [docs/Technical-Report.md](docs/Technical-Report.md).

## Live demo

| | URL |
|---|---|
| Web app (Vercel) | https://bus-booking-system-liard.vercel.app |
| API (Render) | https://busnest-api.onrender.com/api/v1 |
| API docs (Swagger) | https://busnest-api.onrender.com/api/docs |
| Health check | https://busnest-api.onrender.com/health |

Sign in with the [demo accounts](#demo-accounts) (the login page has one-click buttons). The API runs on Render's free plan and sleeps after ~15 minutes of inactivity, so the first request after a pause can take up to a minute.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui-style components (Radix primitives), React Router 7, TanStack Query, React Hook Form, Zod, Recharts, Lucide, qrcode |
| Backend | Node.js, Express 5, TypeScript, Mongoose 8, Zod 4, JWT (access) + rotating opaque refresh tokens, bcrypt (bcryptjs), Helmet, CORS, express-rate-limit |
| Database | MongoDB Atlas (replica set → multi-document transactions); partial unique indexes, TTL index |
| Testing | Vitest, Supertest, mongodb-memory-server (in-memory replica set), React Testing Library |
| Docs / deploy | OpenAPI 3 + Swagger UI, Vercel (client), Render (API), MongoDB Atlas |

## Architecture

```
bus-booking-system/
├── client/                 React app (Vite)
│   └── src/
│       ├── components/     ui/ (design-system primitives), common/, tables/
│       ├── features/       auth, search, trips, seats, bookings, cancellations
│       ├── layouts/        PublicLayout, DashboardLayout (role-aware sidebar)
│       ├── pages/          public/, account/ (passenger), staff/ (admin + operator)
│       ├── routes/         route table with role guards and code-splitting
│       ├── services/       typed API clients
│       └── lib/            fetch wrapper (token refresh), formatting utils
├── server/                 Express API (modular monolith)
│   ├── src/
│   │   ├── config/         env validation, DB connection, OpenAPI, model registry
│   │   ├── middleware/     auth/RBAC, validation, security, errors
│   │   ├── modules/        auth, users, operators, buses, seats, stops, routes,
│   │   │                   trips, bookings, cancellations, reports, audit
│   │   └── utils/
│   ├── scripts/            seed.ts, init-indexes.ts, dev-memory.ts
│   └── tests/              Vitest + Supertest suites
├── docs/                   ER diagram, API docs, technical & testing reports
└── render.yaml             Render blueprint for the API
```

Each server module has `*.model.ts` (Mongoose schema + indexes), a Zod validation schema, a `*.service.ts` with all business logic, and thin routes/controllers. Every response uses one envelope: `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`. APIs are versioned under `/api/v1`.

## Prerequisites

- Node.js 20+ (developed on 22) and npm
- A MongoDB Atlas cluster (the free M0 tier works) — or none at all for the in-memory demo below

## Quick start (no database needed)

Runs the API against a throw-away **in-memory MongoDB replica set**, seeded with demo data. Nothing is persisted.

```bash
cd server && npm install && npm run dev:memory
```

```bash
cd client && npm install && npm run dev
```

Open http://localhost:5173. (The first run downloads a MongoDB binary for mongodb-memory-server; the test suite uses the same binary.)

## Local setup with MongoDB Atlas

1. **Install**
   ```bash
   cd server && npm install
   ```
   ```bash
   cd client && npm install
   ```
2. **Configure the API** — copy `server/.env.example` to `server/.env` and set:
   - `MONGODB_URI` — your Atlas connection string, e.g. `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/busnest?retryWrites=true&w=majority`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` — two different random strings of 32+ characters:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `MONGODB_DB_NAME` — optional, defaults to `busnest` (used even when the URI has no database path).

   The server validates every variable at startup and reports problems by name without printing values.
3. **Atlas network access** — in Atlas → *Network Access*, allow your IP (and `0.0.0.0/0` for Render, whose outbound IPs vary on the free plan). Create a database user with read/write access.
4. **Create indexes and seed demo data**
   ```bash
   cd server && npm run db:init && npm run seed
   ```
   The seed is idempotent — run it again any time; it never duplicates records. `npm run seed -- --reset` wipes the application collections first.
5. **Run**
   ```bash
   cd server && npm run dev
   ```
   ```bash
   cd client && npm run dev
   ```
   API: http://localhost:5000 · Swagger UI: http://localhost:5000/api/docs · App: http://localhost:5173

In development the Vite dev server proxies `/api` to the API, so `client/.env` is optional.

## Demo accounts

Created by the seed script (fictional identities; demo-only passwords). The login page has one-click buttons to fill them in.

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@busnest.example.com` | `Admin@12345` | Full administration |
| Operator | `operator@busnest.example.com` | `Operator@12345` | Deccan Starline only |
| Operator | `operator2@busnest.example.com` | `Operator@12345` | Nilgiri Express Lines only |
| Passenger | `passenger@busnest.example.com` | `Passenger@12345` | Has upcoming, past and cancelled bookings |

Seed data: 4 operators, 9 buses across 5 seat layouts (2+2 seater, 2+1 seater, 2+2 semi-sleeper, two-deck 2+1 and 1+1 sleepers, one seat out of service), 17 stops in 9 cities, 9 routes, daily trips from 3 days ago to 14 days ahead, ~300 bookings and some cancellations — all created through the real booking service.

## Commands

| Where | Command | Purpose |
|---|---|---|
| server | `npm run dev` | API with reload (needs `MONGODB_URI`) |
| server | `npm run dev:memory` | API on a seeded in-memory replica set |
| server | `npm run build` / `npm start` | Compile to `dist/` / run compiled API |
| server | `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| server | `npm test` | API test suite (in-memory replica set) |
| server | `npm run db:init` | Create collections and all indexes, print them |
| server | `npm run db:verify` | Read-only Atlas check: connection, ping, queries, every index, data integrity |
| server | `npm run seed` | Upsert demo data |
| client | `npm run dev` | Vite dev server |
| client | `npm run build` | Typecheck + production build |
| client | `npm run lint` / `npm test` | ESLint / React Testing Library tests |

## Testing

```bash
cd server && npm test
```

```bash
cd client && npm test
```

Server tests start an in-memory MongoDB **replica set**, so transactions behave as on Atlas; each test file gets its own database. Highlights: 12 simultaneous requests for one seat → exactly one `201`; overlapping multi-seat races; partial-allocation rollback; idempotent replays; simultaneous cancellations; refund tiers; manifest/occupancy/revenue figures. Every integrity test runs in both transaction and no-transaction (compensation) modes. Details and results: [docs/Testing-Report.md](docs/Testing-Report.md).

## Deployment (free tiers)

**Database — MongoDB Atlas.** Create an M0 cluster, a database user and network access (above). Run `npm run db:init && npm run seed` locally against it once.

**API — Render.** New → *Blueprint* → select the repository; `render.yaml` defines the service (`rootDir: server`, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/health`). In the dashboard set `MONGODB_URI` and `CLIENT_URL` (your Vercel URL). JWT secrets are generated by Render. `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` are preset because the app and API are on different sites.

**Frontend — Vercel.** Import the repository, set *Root Directory* to `client`, framework Vite. Add `VITE_API_URL=https://<your-render-service>.onrender.com/api/v1`. `client/vercel.json` provides the SPA rewrite and security headers.

After deploying, open `https://<api>/health` (expect `"status":"ok","database":"reachable","transactions":true` — the check pings the database) and sign in on the Vercel URL. Note the Render free plan sleeps after inactivity; the first request can take ~30–60 s.

**Order matters on a first deploy:** create the Render service first (with a temporary `CLIENT_URL`), deploy Vercel with `VITE_API_URL` pointing at Render, then set Render's `CLIENT_URL` to the Vercel URL and redeploy. Atlas *Network Access* must allow `0.0.0.0/0`, because Render's free plan has no fixed outbound IP.

**Redeploying:** Vercel rebuilds automatically on every push to `main`. The Render service has `autoDeploy: false`, so after pushing API changes use *Manual Deploy → Deploy latest commit* in the Render dashboard.

## Security summary

bcrypt password hashing · short-lived JWT access token held in memory only · refresh token in an httpOnly, path-scoped cookie, stored server-side as an HMAC, rotated on every use with reuse detection · server-side role checks and operator/owner scoping on every endpoint · Zod validation (unknown fields stripped) and Mongo-operator stripping · Helmet headers · CORS allow-list · rate limits on auth, booking and the API overall · fares, statuses and availability always computed on the server · request logs without bodies, query strings or tokens · audit log of sensitive actions · secrets only in `.env` (git-ignored).

## Promo codes

Discounts are validated and applied only on the server (taken off the pre-tax fare):

| Code | Offer |
|---|---|
| `SAVE10` | 10% off, up to ₹150 (fare of ₹300+ before tax) |
| `FLAT50` | ₹50 off bookings of ₹500+ before tax |

## Known limitations

- Payments and refunds are **simulated** (marked paid/processed immediately); no gateway integration by design.
- "Download ticket" opens the browser print dialog (choose *Save as PDF*); tickets are not sent by email/SMS/WhatsApp.
- No temporary seat *hold* during checkout: availability is re-checked at confirmation and the loser of a race is sent back to pick another seat (the seat map also refreshes every 15 s).
- A booking is cancelled as a whole; cancelling individual passengers on a multi-seat booking is not supported.
- Trip search sorts and filters one day's results in memory (fine for per-route daily volumes; a very large network would push this into an aggregation pipeline).
- Times are displayed and searched in IST (Asia/Kolkata), matching the seeded network.
- Email/SMS notifications and password reset by email are out of scope.
