# BusNest API Documentation

Interactive docs: **`/api/docs`** (Swagger UI) · machine-readable: **`/api/v1/openapi.json`**. This page summarises the same contract.

## Conventions

- **Base URL:** `/api/v1` (local: `http://localhost:5000/api/v1`).
- **Auth:** `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes. `POST /auth/refresh` exchanges the httpOnly `bn_refresh` cookie (path `/api/v1/auth`) for a new access token and rotates the cookie. Browser clients must send `credentials: 'include'` to auth endpoints.
- **Success:** `{ "success": true, "data": …, "meta"?: { "page", "limit", "total", "totalPages", … } }`
- **Error:** `{ "success": false, "error": { "code", "message", "details"? } }`
- **Pagination:** `?page=1&limit=10` (max 100) on list endpoints.
- **Dates:** ISO-8601 instants in responses. Query dates are `YYYY-MM-DD`, interpreted as IST calendar days.
- **Ids:** 24-char hex ObjectIds; malformed ids → `400`.

### Status codes and error codes

| Status | Typical `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` (with `details: [{ field, message }]`), `INVALID_ID`, `INVALID_JSON`, `INVALID_SEATS`, `INVALID_BOARDING_POINT`, `DEPARTURE_IN_PAST` | Bad input |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `REFRESH_INVALID` | Not authenticated |
| 403 | `FORBIDDEN`, `OPERATOR_NOT_LINKED` | Role or ownership check failed |
| 404 | `NOT_FOUND` | Missing resource (also returned for other passengers' bookings) |
| 409 | `SEAT_ALREADY_BOOKED` (`details.seats`), `SEAT_UNAVAILABLE`, `TRIP_NOT_BOOKABLE`, `TRIP_DEPARTED`, `BOOKING_IN_PROGRESS`, `ALREADY_CANCELLED`, `EMAIL_EXISTS`, `DUPLICATE`, `BUS_SCHEDULE_CONFLICT`, `INVALID_TRIP_TRANSITION`, `TRIP_HAS_BOOKINGS`, `SEAT_IN_USE` | Conflicts with current state |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kB |
| 422 | `IDEMPOTENCY_KEY_REUSED`, `CANCELLATION_NOT_ALLOWED` | Well-formed but not allowed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected (details logged server-side only) |

## Endpoints and permissions

Access: **P** = public, **Pa** = passenger, **Op** = operator (own operator's data only), **Ad** = admin.

### Auth — `/auth`

| Method | Path | Access | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | P | `{ name, email, phone?, password }` → `201 { user, accessToken }` + cookie. Always creates a PASSENGER. Password: 8–72 chars with upper, lower, digit. |
| POST | `/auth/login` | P | `{ email, password }` → `{ user, accessToken }` + cookie |
| POST | `/auth/refresh` | cookie | Rotates refresh cookie → `{ user, accessToken }` |
| POST | `/auth/logout` | cookie | Revokes the refresh token, clears cookie |
| GET | `/auth/me` | any | Current profile |
| PATCH | `/auth/me` | any | `{ name?, phone? }` |
| PATCH | `/auth/me/password` | any | `{ currentPassword, newPassword }` — revokes all sessions |

Auth endpoints are rate-limited (30 per 15 min per IP by default).

### Trips — `/trips`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/trips/search` | P | `from`, `to`, `date` (required); `passengers` 1–6; `sort` = `departure\|arrival\|price\|seats\|duration\|rating`; `order`; `busType` (CSV `SEATER,SEMI_SLEEPER,SLEEPER`); `ac`; `departureSlot` (CSV `EARLY,MORNING,AFTERNOON,NIGHT`); `maxPrice`; paging. Unknown city pair → empty list. `meta.facets` has bus types and price range. |
| GET | `/trips/:id` | P | Trip, bus, operator, route, boarding/dropping points with times, availability |
| GET | `/trips/:id/seats` | P | Live seat map: `layout` + every seat with `status` (`AVAILABLE\|BOOKED\|UNAVAILABLE`) and `fare`; `Cache-Control: no-store` |
| GET | `/trips` | Op, Ad | Management list with `bookedSeats`, `totalSeats`, `occupancyPercent`; filters `status`, `routeId`, `busId`, `from`, `to` |
| POST | `/trips` | Op, Ad | `{ routeId, busId, departureTime (ISO), baseFare, repeatDays 1–30 }` → `{ created, tripIds }`. Rejects past departures, mismatched operators and overlapping trips of the same bus (whole schedule validated first). |
| PATCH | `/trips/:id` | Op, Ad | `{ baseFare?, departureTime?, status? }`. Fare affects new bookings only. Reschedule only without bookings. `status: CANCELLED` refunds every booking 100 %. |
| GET | `/trips/:id/manifest` | Op, Ad | Trip summary + confirmed passengers in seat order |

Search example:

```http
GET /api/v1/trips/search?from=Bengaluru&to=Chennai&date=2026-11-20&passengers=2&sort=price
```

```json
{
  "success": true,
  "data": [{
    "_id": "…", "departureTime": "2026-11-20T07:30:00.000Z", "arrivalTime": "2026-11-20T14:30:00.000Z",
    "durationMinutes": 420, "baseFare": 520, "minFare": 520, "maxFare": 520,
    "totalSeats": 43, "availableSeats": 37,
    "operator": { "_id": "…", "name": "Nilgiri Express Lines", "rating": 4.3 },
    "bus": { "_id": "…", "name": "Nilgiri Day Rider", "busType": "SEATER", "isAC": false, "amenities": ["Live tracking"] },
    "boardingPoints": [{ "stopId": "…", "name": "Silk Board Junction", "type": "BOARDING", "time": "…" }],
    "droppingPoints": [{ "stopId": "…", "name": "Koyambedu CMBT", "type": "DROPPING", "time": "…" }]
  }],
  "meta": { "page": 1, "limit": 10, "total": 2, "totalPages": 1, "facets": { "busTypes": ["SEATER", "SEMI_SLEEPER"], "minPrice": 520, "maxPrice": 780 } }
}
```

### Bookings — `/bookings`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/bookings` | Pa | Header **`Idempotency-Key`** (8–64 URL-safe chars) required. Body below. `201` new booking; `200` + `Idempotent-Replayed: true` for a repeat. |
| GET | `/bookings/me` | Pa | Own bookings; `status`, `when=upcoming\|past` |
| GET | `/bookings` | Op, Ad | Scoped list; `status`, `search` (PNR/email/phone), `tripId`, `operatorId` (admin) |
| GET | `/bookings/:id` | owner Pa, Op, Ad | Full ticket: fare, passengers, stops with times, bus, operator, cancellation |
| GET | `/bookings/pnr/:pnr` | owner Pa, Op, Ad | Same, by PNR |
| GET | `/bookings/:id/cancellation-quote` | owner Pa, Ad | Refund preview |
| POST | `/bookings/:id/cancel` | owner Pa, Ad | `{ reason }` (3–300 chars) |

Create booking:

```http
POST /api/v1/bookings
Authorization: Bearer <token>
Idempotency-Key: 3f1c2a9e-6b0d-4c55-9a51-0c6b1f2d7e10
Content-Type: application/json

{
  "tripId": "…", "boardingStopId": "…", "droppingStopId": "…",
  "contact": { "email": "asha@example.com", "phone": "9876543210" },
  "passengers": [
    { "seatId": "…", "name": "Asha Rao", "age": 29, "gender": "FEMALE" },
    { "seatId": "…", "name": "Ravi Rao", "age": 31, "gender": "MALE" }
  ]
}
```

There are no price, status or PNR fields — the server computes them (`fare = baseFare × seats + seat premiums + GST`) and ignores anything extra.

Seat conflict:

```json
{ "success": false, "error": { "code": "SEAT_ALREADY_BOOKED",
  "message": "Seat 3B was just booked by someone else. Please choose another seat.",
  "details": { "seats": [{ "seatId": "…", "seatNumber": "3B" }] } } }
```

Cancellation quote:

```json
{ "success": true, "data": { "allowed": true, "hoursBeforeDeparture": 30.5, "refundPercent": 75,
  "refundAmount": 1575, "cancellationFee": 525, "refundType": "PARTIAL", "total": 2100,
  "policy": { "cutoffHours": 2, "tiers": [{ "minHours": 48, "refundPercent": 100 }, { "minHours": 24, "refundPercent": 75 }, { "minHours": 12, "refundPercent": 50 }, { "minHours": 0, "refundPercent": 0 }] } } }
```

Operators cannot cancel individual bookings (`403`); they cancel the trip instead.

### Cancellations — `/cancellations`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/cancellations` | Pa (own), Op (own trips), Ad (all) | Cancellations with refund amount, fee, status, reference, booking summary |
| GET | `/cancellations/policy` | P | Current cut-off and refund tiers |

### Network and fleet

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/operators/public` | P | Active operators (public fields, bus counts) |
| GET / POST | `/operators` | Ad | List (search, `isActive`) / create `{ name, code, contactEmail, contactPhone, description?, rating?, isActive? }` |
| PATCH | `/operators/:id` | Ad | Update |
| GET | `/buses` | Op, Ad | Scoped list with seat counts |
| GET | `/buses/:id` | Op, Ad | Bus + full seat layout |
| POST | `/buses` | Ad | `{ operatorId, name, registrationNumber, isAC, amenities[], layout: { template, rows, windowPremium?, lowerDeckPremium? } }`; templates `SEATER_2X2`, `SEATER_2X1`, `SEMI_SLEEPER_2X2`, `SLEEPER_2X1`, `SLEEPER_1X1` — seats are generated |
| PATCH | `/buses/:id` | Ad | `{ name?, isAC?, amenities?, isActive? }` |
| PATCH | `/buses/:id/seats/:seatId` | Ad | `{ isActive?, priceModifier? }`; cannot disable a seat booked on an upcoming trip (`409 SEAT_IN_USE`) |
| GET | `/routes/popular` | P | City pairs ranked by bookings with lowest upcoming fare |
| GET | `/routes`, `/routes/:id` | Op, Ad | Scoped |
| POST | `/routes` | Ad | `{ operatorId, code, sourceCity, destinationCity, distanceKm, durationMinutes, stops: [{ stopId, type, offsetMinutes }] }`; all boarding points must precede dropping points |
| PATCH | `/routes/:id` | Ad | `{ distanceKm?, durationMinutes?, stops?, isActive? }` — applies to new trips |
| GET | `/stops`, `/stops/cities` | P | Stops (search, `city`) / distinct cities |
| POST / PATCH | `/stops`, `/stops/:id` | Ad | `{ name, city, address?, landmark?, isActive? }` |
| GET / POST | `/users` | Ad | List (search, `role`) / create any role (`operatorId` required for OPERATOR) |
| PATCH | `/users/:id` | Ad | Role, operator link, name, phone, `isActive`; revokes sessions on role/status change; cannot lock yourself out |

### Reports and audit

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/reports/dashboard` | Op, Ad | `stats` (bookings by status, seats sold, revenue, refunds, fees, scheduled/total trips, buses, occupancy %, admin extras), `routeSummary`, 14-day `trend`, `recentBookings` |
| GET | `/reports/occupancy` | Op, Ad | Per-trip occupancy for `from`/`to`; `meta.summary = { capacity, sold, percent }` |
| GET | `/reports/bookings` | Op, Ad | `totals` and route-wise summary for bookings made between `from` and `to` |
| GET | `/audit` | Ad | Audit trail; `search` (action), `entityType` |

### Health

`GET /health` → `200 { status: "ok", transactions: true, uptime }` or `503` when the database is unavailable.
