# PROJECT STATUS — BusNest (Bus Booking Management System)

_Last updated: 2026-11-12_

## Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation: monorepo, TS, env config | in progress |
| 2 | Mongoose models, indexes, seed, DB connection | pending |
| 3 | Auth: register/login/refresh/logout, RBAC | pending |
| 4 | Admin management: operators, buses, seats, routes, stops, trips, fares | pending |
| 5 | Passenger UI: landing, search, trip details, seat map, checkout | pending |
| 6 | Booking engine: allocation, concurrency, PNR, idempotency | pending |
| 7 | Cancellation, refunds, manifests, reports, audit | pending |
| 8 | Tests (Vitest, Supertest, RTL), security | pending |
| 9 | Docs + deployment config (Vercel, Render) | pending |
| 10 | Final verification | pending |

## Key decisions

- Modular monolith: `server/` (Express + Mongoose) and `client/` (Vite + React).
- Seat integrity: `SeatAllocation` collection with a partial unique index on
  `(tripId, seatId)` where `status = ACTIVE`; transactions when the deployment
  is a replica set, compensation strategy otherwise.
- Tests run against an in-memory MongoDB replica set (`mongodb-memory-server`),
  so they need no Atlas credentials.

## Known issues / blockers

- None yet.

## Next actions

- See phase table.
