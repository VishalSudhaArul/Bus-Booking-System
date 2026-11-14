# BusNest — Testing Report

_Run date: 2026-11-13 · Node 22.20 · Windows 11_

## Summary

| Suite | Tool | Files | Tests | Result |
|---|---|---|---|---|
| API (unit + integration) | Vitest + Supertest + mongodb-memory-server | 7 | 97 | ✅ all passing |
| Frontend (components + routing) | Vitest + React Testing Library (jsdom) | 2 | 13 | ✅ all passing |
| Server TypeScript (`tsc --noEmit`) / ESLint / build | — | — | — | ✅ |
| Client TypeScript (`tsc -b`) / ESLint / `vite build` | — | — | — | ✅ |

Commands: `cd server && npm test` and `cd client && npm test`.

## Test environment

The API suite starts one **in-memory MongoDB replica set** (MongoDB 7.0) for the run, so multi-document transactions behave exactly as on Atlas. Each test file connects to its own fresh database and builds all production indexes before running, so the partial unique index under test is the real one. Files run sequentially; tests inside a file hit the API through Supertest — the full middleware stack, validation, auth and error handler included.

Integrity-critical suites run **twice**: once with transactions and once with transactions switched off (`setTransactionSupport(false)`), which exercises the compensation strategy used on deployments without replica sets.

## Coverage of the required scenarios

### Authentication (`tests/auth.test.ts`, 18 tests)

| Scenario | Test |
|---|---|
| Successful registration | creates a PASSENGER, returns a token and an httpOnly refresh cookie, stores a bcrypt hash, never returns the hash |
| Privilege escalation | a `role: "ADMIN"` field in the registration body is ignored |
| Duplicate email | `409 EMAIL_EXISTS` (case-insensitive) |
| Invalid input | `400 VALIDATION_ERROR` with field-level details |
| Invalid credentials | wrong password and unknown email both `401 INVALID_CREDENTIALS` with identical messages |
| Deactivated account | `401 ACCOUNT_DISABLED` |
| NoSQL injection | `{ "$gt": "" }` credentials rejected with 400 |
| Missing / malformed / foreign-signed token | `401 UNAUTHORIZED` / `TOKEN_INVALID` |
| Expired token | `401 TOKEN_EXPIRED` |
| Refresh rotation and logout | refresh issues a new cookie; the old one stops working; logout revokes the session |
| Unauthorised access | passengers get 403 on users, operators, buses, reports, audit, staff bookings |
| Role restrictions | operators cannot create operators or view users/audit; staff cannot book |
| Ownership | an operator sees only its own buses; another operator's bus, manifest and trip edits → 403; an `operatorId` query parameter cannot widen scope |
| Admin management | admin creates an operator and a two-deck sleeper (30 generated seats); audit entry recorded |

### Trips (`tests/trips.test.ts`, 14 tests)

Valid search with operator, bus type, times, duration, boarding/dropping points, fare and live availability · availability drops after a booking · trips without enough seats for the party are hidden · filters (bus type, AC, max price) · sorting (price desc, departure asc) · pagination · unknown route → empty list · no trips on the date → empty list · invalid searches (same city, bad date, missing date, 99 passengers) → 400 · trip details and seat map (`no-store`, booked status, window premium in fare) · unknown trip 404 / malformed id 400 · bus double-scheduling → `409 BUS_SCHEDULE_CONFLICT` · operator schedules a 3-day series and edits the fare · past departure 400 · invalid status transition 409.

### Booking (`tests/bookings.test.ts`, 25 tests)

| Scenario | Result |
|---|---|
| Successful booking | PNR format, `CONFIRMED`, seats, server-computed fare `{1000, 50, 5 %, 52.5, 1102.5}`, payment `PAID`, 2 ACTIVE allocations; internal fields not exposed |
| Client-supplied price/status/PNR | ignored; server fare and fresh PNR used |
| Invalid passenger details | age 0, non-numeric age, empty name, unknown gender, no passengers, bad contact → 400, nothing written |
| Invalid seat selection | seat from another bus `INVALID_SEATS`; duplicate seat 400; 7 seats 400; out-of-service seat `409 SEAT_UNAVAILABLE` |
| Invalid stops / unknown trip | reversed boarding/dropping 400; unknown trip 404 |
| Already booked seat | `409 SEAT_ALREADY_BOOKED` naming seat 1A |
| Missing Idempotency-Key / anonymous | 400 / 401 |
| **Duplicate PNR prevention** | generator forced to return the same PNR twice → second booking retries and gets a different PNR; only one booking holds it |
| PNR uniqueness | 12 bookings → 12 distinct PNRs |
| **Concurrent requests** ×2 modes | 12 users race for one seat → exactly **1 × 201, 11 × 409**; DB has 1 allocation, 1 booking, 1 passenger |
| Overlapping multi-seat races ×2 modes | 8 requests for seat pairs [0,1],[1,2],… → no seat held twice; losers leave nothing behind |
| **Partial allocation failure and recovery** ×2 modes | request A+B with B taken → 409 naming B; A not allocated, no booking/passengers; A then books successfully |
| **Idempotent repeated requests** ×2 modes | same key twice → 201 then 200 replay with the same id and PNR |
| Concurrent duplicate submits ×2 modes | 6 simultaneous identical requests → exactly one booking and its 2 allocations |
| Key reused with a different payload | `422 IDEMPOTENCY_KEY_REUSED` |
| Keys scoped per user | two users may use the same key |
| Ownership | other passengers get 404 on view, PNR lookup and cancel; `/bookings/me` lists only own bookings; owning operator and admin can view, rival operator 403 |
| Crash recovery | a stale PENDING booking holding a seat is discarded by reconciliation; the seat becomes bookable; healthy bookings untouched |

### Cancellation (`tests/cancellations.test.ts`, 21 tests)

Pure refund calculation across all tiers (72, 48, 47.9, 24, 13, 5, 2 h), cut-off and post-departure refusal, custom policy and paise rounding · **successful cancellation** with quote → cancel → 75 % refund `1575/525`, refund reference, `PARTIALLY_REFUNDED` (×2 modes) · **seat release**: seat map shows no booked seats and the seat is re-bookable · **history preservation**: booking, passengers and RELEASED allocations remain · **repeated cancellation** → `409 ALREADY_CANCELLED`, one cancellation row (×2 modes) · 6 simultaneous cancellations → exactly one succeeds (×2 modes) · full refund when early · late cancellation with no refund (`NOT_APPLICABLE`) · inside cut-off → `422`, booking and seat unchanged · **invalid cancellations**: missing/short reason 400, unknown id 404, malformed id 400, anonymous 401, operator 403 · admin cancels on a passenger's behalf · operator cancels a trip → every booking refunded 100 %, all seats released, trip no longer bookable.

### Reporting (`tests/reports.test.ts`, 6 tests)

Fixture: operator A (12-seat bus, fare 1000) with 3 bookings / 5 seats, one 2-seat booking cancelled at 75 %; operator B with 1 booking.

| Check | Expected and observed |
|---|---|
| **Passenger manifest** | seats `1A, 1B, 1C` only (cancelled excluded), names/ages/genders/contact/stops/fare correct, summary `{12 seats, 3 booked, 9 free, 25 %, 2 bookings}` |
| **Seat occupancy** | trip at 3/12 = 25 %; period summary `{capacity 12, sold 3, 25 %}` |
| **Booking totals** | 3 bookings (2 confirmed, 1 cancelled), 3 seats, revenue 3675 (3150 confirmed + 525 retained fee), refunds 1575 |
| Operator dashboard | same figures, 14-day trend sums to 3, scoped (operator B sees only its own 1 booking, revenue 420) |
| Admin dashboard | combined 4 bookings, revenue 4095, 2 operators, occupancy 4/24 = 16.67 % |
| Access | passengers and rival operators blocked from reports and manifests |

### Seed and utilities (`tests/seed.test.ts`, `tests/unit.test.ts`)

Seed creates the full demo dataset, a second run creates **zero** new records, no seat is double-allocated, no PENDING bookings remain, and all three demo logins work · seat-layout generation (2+2 numbering/positions/premiums; two-deck sleeper) · fare rounding · PNR alphabet and uniqueness (500 draws) · IST day boundaries · Mongo-operator stripping · 404 envelope, malformed JSON 400, security headers, CORS allow/deny, OpenAPI served.

### Frontend (`client/src/test`, 13 tests)

SeatMap renders server status, disables booked/unavailable seats, ignores clicks on them, marks selection with `aria-pressed`, enforces the seat limit, switches decks · fare preview matches the server formula and renders the breakdown · search widget validation (missing city, same city), navigation with query string, swap button · checkout and registration schemas reject invalid passengers, contacts and weak/mismatched passwords · ProtectedRoute: guest → login, wrong role → own home, session restored from refresh cookie → admitted.

## Manual end-to-end verification

Performed in a browser against `npm run dev:memory` (seeded in-memory replica set):

1. Landing page → popular route → results (filters/sort) → trip page with live seat map.
2. Selected seats → **Continue** while signed out → login → returned to checkout with the selection intact.
3. Empty submit shows field errors; passenger 1 pre-filled from the profile → confirmed → ticket with PNR.
4. Cancel dialog showed the 50 % tier for a trip 19 h away (₹1,270.50) → cancelled → ticket marked cancelled, refund shown → the released seat was booked again.
5. Operator console: dashboard (all charts rendered), trips, manifest with correct passengers — data limited to the operator's own buses.
6. Admin console: all 10 management pages load data; created an operator, a bus (generated two-deck layout) and a 3-day trip series via the UI; the trip appeared in public search at the right IST time.
7. Responsive: no horizontal overflow at 375 px on home, trip, dashboard, trips, bus layout and reports pages.

Defects found and fixed during this pass: a `useEffect` returning `window.scrollTo`'s Promise blanked the app in Chromium; the checkout's stale-seat guard redirected to the seat map after a *successful* booking (own seats now BOOKED); grid cards overflowed at 375 px (`min-w-0`); trip card and ticket columns cramped beside the sidebar (moved to `xl`); the manifest date picker did not follow a linked trip.

## Verification on MongoDB Atlas (2026-11-14)

Against the project's Atlas cluster (database `busnest`):

- Topology check reported a replica set → **transactions enabled**; `npm run db:init` built every index, including `uniq_active_trip_seat` (unique, partial `{ status: 'ACTIVE' }`).
- `npm run seed` loaded 4 operators, 17 stops, 9 buses, 9 routes, 162 trips, 299 bookings and 16 cancellations; a **second run created nothing**.
- With the API running on Atlas, a scripted end-to-end run passed **14/14** checks: health + transactions, demo logins for all roles, search, a **10-way race for one seat → exactly one 201 and nine 409 SEAT_ALREADY_BOOKED**, idempotent replay (same PNR), passenger/operator ownership (404/403), manifest contents, live admin dashboard totals, cancellation refund equals the quote, repeat cancellation refused, seats available again.
- The web app was checked in the browser against the same API.

## Not covered

- The deployed Render/Vercel URLs (need the owner's accounts).
- Load testing beyond the concurrency tests; cross-browser testing beyond Chromium.
