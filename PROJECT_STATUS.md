# PROJECT STATUS — BusNest (Bus Booking Management System)

_Last updated: 2026-11-14_

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation: monorepo, TypeScript, env validation | ✅ Done |
| 2 | Mongoose models, indexes, seed, connection handling, ER diagram | ✅ Done |
| 3 | Auth: register/login/refresh rotation/logout, RBAC, protected routes | ✅ Done |
| 4 | Admin management: operators, users, buses + seat layouts, stops, routes, trips, fares | ✅ Done |
| 5 | Passenger UI: landing, search/filter/sort, trip details, seat map, checkout | ✅ Done |
| 6 | Booking engine: partial-unique seat allocation, transactions + compensation, PNR, idempotency, e-ticket | ✅ Done |
| 7 | Cancellation policy and simulated refunds, manifests, occupancy, dashboards, audit log | ✅ Done |
| 8 | Tests (Vitest/Supertest/RTL), security, responsive checks | ✅ Done |
| 9 | README, API docs, technical & testing reports, Vercel/Render config | ✅ Done |
| 10 | Final verification | ✅ Done locally and on MongoDB Atlas — live deployment pending (needs user accounts) |

## Security upgrade and Atlas verification (2026-11-14, branch `security/dependency-upgrades`)

### MongoDB Atlas — verified with real connections and queries

`npm run db:verify` (new, read-only) against the configured cluster; the connection string is never printed.

| Check | Result |
|---|---|
| `server/.env` present, `MONGODB_URI` set | ✅ |
| URI format | ✅ `mongodb+srv`, credentials present, `*.mongodb.net` host, no placeholders |
| Connected | ✅ (0.8–2.8 s) |
| Mongoose `readyState` | ✅ 1 |
| Database name | ✅ `busnest` (via new `MONGODB_DB_NAME`, default `busnest`) |
| `ping` command | ✅ |
| Transactions | ✅ replica set → multi-document transactions in use |
| Read queries | ✅ all 14 collections counted and read (e.g. 351 bookings, 705 seat allocations, 162 trips) |
| Indexes | ✅ every index declared in the models exists with matching unique/partial/TTL options, incl. `uniq_active_trip_seat` (unique, partial `{status: "ACTIVE"}`) |
| Data integrity | ✅ no seat actively allocated twice; 0 bookings stuck in `PENDING` |
| Seed idempotency | ✅ re-run created 0 records; counts of all 12 business collections identical before/after |
| `/health` | ✅ now performs a real `ping` (2 s timeout): `{ status: "ok", database: "reachable", databaseLatencyMs, transactions }`; 503 if the ping fails; no host, database name or driver error exposed |

### Dependency versions

| Package | Where | Before | After | Reason |
|---|---|---|---|---|
| `zod` | server, client | 3.25.76 | **4.6.7** | GHSA-mrhx-c7xc-m3w5 (high): memory exhaustion validating oversized constrained collections; fixed in 4.6.6 |
| `@hookform/resolvers` | client | 3.10.0 | **5.9.2** | required for Zod 4 (3.x supports Zod 3 only) |
| `react-router-dom` / `react-router` | client | 6.30.6 | **7.18.5** | GHSA-wrjc-x8rr-h8h6 (moderate): open redirect via backslash in `<Link>`/`useNavigate`; fixed in 7.18.0. Also clears GHSA-337j-9hxr-rhxg (SSR-only; this app was not exposed). 7.x kept (not 8.x) because v8 requires React 19 and drops `react-router-dom`. |

Code changes for the upgrades (validation rules and API contracts unchanged):
- Zod: `invalid_type_error` / `required_error` ported to v4's `error` option with identical semantics; `ZodTypeAny` → `ZodType`; forms with coerced numbers declare separate input/output types for resolvers 5.
- React Router: removed the `future` prop (both v7 flags are now defaults). The official v6→v7 guide is no longer published (docs and repo now cover v8), so the upgrade was validated by the compiler, tests and a browser check instead.
- Open-redirect hardening: new `safeInternalPath()` / `redirectFromState()` applied to every navigation target taken from router state (login, register, `GuestOnly`, trip back button). Testing showed React Router 7.18.5 still renders backslash hrefs verbatim, which browsers treat as `//host`, so app-level validation is required.

### Security advisories

| | Before (prod / all) | After (prod / all) |
|---|---|---|
| server | 1 high / 11 (2 critical, 1 high, 8 moderate) | **0** / 10 (2 critical, 8 moderate) |
| client | 1 high + 2 moderate / 13 (2 critical, 1 high, 10 moderate) | **0** / 10 (2 critical, 8 moderate) |

Resolved: zod GHSA-mrhx-c7xc-m3w5 (server + client), react-router GHSA-wrjc-x8rr-h8h6 and GHSA-337j-9hxr-rhxg (client).

Remaining — development tooling only, not shipped to users, not suppressed:
- `vitest` 3.x (direct) → `@vitest/mocker` GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 and `tinypool` GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (critical). Affect the local test runner; fix requires Vitest 5 (major).
- `typescript-eslint` (direct) → `minimatch` GHSA-g3hv-75wg-m249 (moderate ReDoS in lint tooling); fix requires a typescript-eslint major per npm.

### Results (clean clone of the branch, `npm ci`)

| | Typecheck | Lint | Build | Tests |
|---|---|---|---|---|
| Server | ✅ | ✅ | ✅ | ✅ 98/98 (+1 health-check test) |
| Client | ✅ | ✅ | ✅ | ✅ 45/45 (+32 open-redirect regression tests) |

Browser checks on React Router 7 + Atlas: guest → `/account` redirects to `/login`; injected `from: //evil.com/phish` ignored after sign-in (stayed on origin, landed on `/account`); passenger → `/admin` sent to `/account`; Zod 4 coerced form validation (admin bus dialog) behaves as before.

### Unresolved / follow-ups
- Dev-tool advisories above (Vitest 5, typescript-eslint) — separate major upgrades.
- Zod 4 wording of its *built-in* fallback messages differs (e.g. missing number: "Invalid input: expected number, received undefined" instead of "Required"); custom messages and error codes are unchanged.

## Verification (2026-11-13)

- Server: `tsc` ✅, ESLint ✅, `npm run build` ✅, **97/97 tests** ✅ (in-memory replica set).
- Client: `tsc -b` ✅, ESLint ✅, `vite build` ✅, **13/13 tests** ✅.
- Browser walkthrough against the seeded API (`npm run dev:memory`): search → seat selection → sign-in redirect keeps selection → checkout validation → booking confirmed with PNR → ticket → cancel with refund preview → seat released and re-booked; operator dashboard/trips/manifest scoped to own operator; admin pages all load; admin created an operator, a bus (generated layout) and a 3-day trip series through the UI. No horizontal overflow at 375 px.

## Acceptance checklist

All items verified by automated tests and/or the browser walkthrough above, except the two marked pending.

- [x] Passenger/Admin/Operator can log in; passenger can register
- [x] Admin creates operators, buses, routes, trips
- [x] Search, trip details, seat selection, passenger details, confirmation, unique PNR
- [x] Two users cannot book the same seat (12-way race → exactly one 201, both persistence modes)
- [x] Repeated requests do not duplicate bookings (sequential and concurrent replays)
- [x] Ticket view, eligible cancellation, refund status, seats released, history preserved
- [x] Operator manifest and occupancy; admin booking summaries; metrics from real data
- [x] Server-side authorisation; negative-case tests
- [x] Frontend build and backend compilation pass
- [x] Documentation complete; secrets git-ignored; seed reproducible and idempotent
- [x] Verified against the user's MongoDB Atlas cluster (2026-11-14): transactions enabled, all indexes built, seed run twice (second run created nothing), 14/14 end-to-end API checks incl. a 10-way seat race (1 × 201, 9 × 409)
- [ ] Deployed to Render/Vercel — **needs the user's accounts; not pushed or deployed**

## Known issues / limitations

See README → Known limitations (simulated payments, no seat hold, whole-booking cancellation, in-memory day-level search sort, IST only).

## Next actions

1. Done: Atlas connected (database `busnest`) and seeded. 10 test passenger accounts `race-tester-1..10@busnest.example.com` were created by the Atlas verification run; their bookings were cancelled.
2. With approval: add a GitHub remote and push; deploy via `render.yaml` and Vercel (README → Deployment).
