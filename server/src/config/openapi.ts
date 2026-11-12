/**
 * OpenAPI 3 description of the BusNest API, served at /api/docs (Swagger UI)
 * and /api/v1/openapi.json. Kept as plain data so it has no runtime cost.
 */
type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json, example?: unknown) => ({ content: { 'application/json': { schema, ...(example ? { example } : {}) } } });
const ok = (description: string, data: Json = { type: 'object' }, paged = false) => ({
  description,
  ...json({
    type: 'object',
    properties: { success: { type: 'boolean', example: true }, data, ...(paged ? { meta: ref('PageMeta') } : {}) },
  }),
});
const err = (description: string, code: string, message: string) => ({
  description,
  ...json(ref('Error'), { success: false, error: { code, message } }),
});

const E = {
  400: err('Validation failed', 'VALIDATION_ERROR', 'Request validation failed'),
  401: err('Missing, invalid or expired access token', 'UNAUTHORIZED', 'Authentication required'),
  403: err('Role or ownership check failed', 'FORBIDDEN', 'You do not have permission to perform this action'),
  404: err('Resource not found', 'NOT_FOUND', 'Booking not found'),
  409: err('Conflict', 'CONFLICT', 'Conflict'),
  429: err('Rate limited', 'RATE_LIMITED', 'Too many requests. Please slow down.'),
};

const secured = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } };
const q = (name: string, schema: Json, description?: string, required = false) => ({ name, in: 'query', required, schema, ...(description ? { description } : {}) });
const paging = [q('page', { type: 'integer', minimum: 1, default: 1 }), q('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 })];
const str = { type: 'string' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const id = { type: 'string', example: '665f1c2e9b1e8a0012a4c001' };

interface Op {
  tag: string;
  summary: string;
  roles?: string;
  params?: unknown[];
  body?: Json;
  bodyExample?: unknown;
  responses: Record<string, unknown>;
}

const op = (o: Op) => ({
  tags: [o.tag],
  summary: o.summary,
  description: o.roles ? `**Access:** ${o.roles}` : '**Access:** public',
  ...(o.roles ? { security: secured } : {}),
  ...(o.params ? { parameters: o.params } : {}),
  ...(o.body ? { requestBody: { required: true, ...json(o.body, o.bodyExample) } } : {}),
  responses: { ...o.responses, ...(o.roles ? { 401: E[401], 403: E[403] } : {}) },
});

const crud = (tag: string, entity: string, schema: string, readRoles: string, extraListParams: unknown[] = []) => ({
  list: op({ tag, summary: `List ${entity}s`, roles: readRoles, params: [...paging, q('search', str), ...extraListParams], responses: { 200: ok(`${entity} list`, { type: 'array', items: ref(schema) }, true) } }),
  create: op({ tag, summary: `Create ${entity}`, roles: 'ADMIN', body: ref(`${schema}Input`), responses: { 201: ok(`${entity} created`, ref(schema)), 400: E[400], 409: err('Duplicate unique value', 'DUPLICATE', 'A record with the same code already exists') } }),
  update: op({ tag, summary: `Update ${entity}`, roles: 'ADMIN', params: [idParam], body: ref(`${schema}Input`), responses: { 200: ok(`${entity} updated`, ref(schema)), 400: E[400], 404: E[404] } }),
});

const operators = crud('Operators', 'operator', 'Operator', 'ADMIN');
const buses = crud('Buses', 'bus', 'Bus', 'ADMIN, OPERATOR (own buses)', [q('operatorId', str)]);
const routes = crud('Routes', 'route', 'Route', 'ADMIN, OPERATOR (own routes)', [q('operatorId', str)]);
const stops = crud('Stops', 'stop', 'Stop', 'public', [q('city', str)]);
const users = crud('Users', 'user', 'User', 'ADMIN', [q('role', { type: 'string', enum: ['ADMIN', 'OPERATOR', 'PASSENGER'] })]);

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'BusNest API',
    version: '1.0.0',
    description:
      'REST API for the BusNest bus booking management system.\n\n' +
      '**Response envelope** — success: `{ success: true, data, meta? }`; failure: `{ success: false, error: { code, message, details? } }`.\n\n' +
      '**Auth** — send the access token as `Authorization: Bearer <token>`. The refresh token is an httpOnly cookie scoped to `/api/v1/auth`.\n\n' +
      '**Idempotency** — `POST /bookings` requires an `Idempotency-Key` header; repeating a request with the same key returns the original booking.',
  },
  servers: [{ url: '/api/v1', description: 'Current host' }],
  tags: ['Auth', 'Trips', 'Bookings', 'Cancellations', 'Operators', 'Buses', 'Routes', 'Stops', 'Users', 'Reports', 'Audit'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: str,
              details: { description: 'Field errors for validation failures, conflicting seats for booking conflicts' },
            },
          },
        },
      },
      PageMeta: { type: 'object', properties: { page: num, limit: num, total: num, totalPages: num } },
      User: { type: 'object', properties: { _id: id, name: str, email: str, phone: str, role: { type: 'string', enum: ['ADMIN', 'OPERATOR', 'PASSENGER'] }, operatorId: { ...id, nullable: true }, isActive: bool } },
      UserInput: { type: 'object', required: ['name', 'email', 'password', 'role'], properties: { name: str, email: str, password: str, phone: str, role: { type: 'string', enum: ['ADMIN', 'OPERATOR', 'PASSENGER'] }, operatorId: id, isActive: bool } },
      AuthSession: { type: 'object', properties: { user: ref('User'), accessToken: { type: 'string', description: 'JWT, 15 minutes by default' } } },
      Operator: { type: 'object', properties: { _id: id, name: str, code: str, contactEmail: str, contactPhone: str, description: str, rating: num, isActive: bool, busCount: num } },
      OperatorInput: { type: 'object', required: ['name', 'code', 'contactEmail', 'contactPhone'], properties: { name: str, code: { type: 'string', example: 'DSL' }, contactEmail: str, contactPhone: str, description: str, rating: num, isActive: bool } },
      Stop: { type: 'object', properties: { _id: id, name: str, city: str, address: str, landmark: str, isActive: bool } },
      StopInput: { type: 'object', required: ['name', 'city'], properties: { name: str, city: str, address: str, landmark: str, isActive: bool } },
      Seat: { type: 'object', properties: { _id: id, seatNumber: { type: 'string', example: '3B' }, deck: { type: 'string', enum: ['LOWER', 'UPPER'] }, row: num, column: num, seatType: str, position: { type: 'string', enum: ['WINDOW', 'AISLE'] }, priceModifier: num, isActive: bool } },
      Bus: { type: 'object', properties: { _id: id, operatorId: ref('Operator'), name: str, registrationNumber: str, busType: { type: 'string', enum: ['SEATER', 'SEMI_SLEEPER', 'SLEEPER'] }, isAC: bool, amenities: { type: 'array', items: str }, layout: { type: 'object' }, totalSeats: num, seats: { type: 'array', items: ref('Seat') } } },
      BusInput: {
        type: 'object',
        required: ['operatorId', 'name', 'registrationNumber', 'layout'],
        properties: {
          operatorId: id,
          name: str,
          registrationNumber: { type: 'string', example: 'KA01AB1234' },
          isAC: bool,
          amenities: { type: 'array', items: str },
          layout: { type: 'object', properties: { template: { type: 'string', enum: ['SEATER_2X2', 'SEATER_2X1', 'SEMI_SLEEPER_2X2', 'SLEEPER_2X1', 'SLEEPER_1X1'] }, rows: num, windowPremium: num, lowerDeckPremium: num } },
        },
      },
      RouteStop: { type: 'object', required: ['stopId', 'type', 'offsetMinutes'], properties: { stopId: id, type: { type: 'string', enum: ['BOARDING', 'DROPPING'] }, offsetMinutes: num } },
      Route: { type: 'object', properties: { _id: id, operatorId: ref('Operator'), code: str, sourceCity: str, destinationCity: str, distanceKm: num, durationMinutes: num, stops: { type: 'array', items: ref('RouteStop') }, isActive: bool } },
      RouteInput: { type: 'object', required: ['operatorId', 'code', 'sourceCity', 'destinationCity', 'distanceKm', 'durationMinutes', 'stops'], properties: { operatorId: id, code: str, sourceCity: str, destinationCity: str, distanceKm: num, durationMinutes: num, stops: { type: 'array', items: ref('RouteStop') } } },
      TripSearchResult: {
        type: 'object',
        properties: {
          _id: id, departureTime: { type: 'string', format: 'date-time' }, arrivalTime: { type: 'string', format: 'date-time' }, durationMinutes: num,
          baseFare: num, minFare: num, totalSeats: num, availableSeats: num,
          operator: { type: 'object', properties: { _id: id, name: str, rating: num } },
          bus: { type: 'object', properties: { _id: id, name: str, busType: str, isAC: bool, amenities: { type: 'array', items: str } } },
          boardingPoints: { type: 'array', items: { type: 'object' } }, droppingPoints: { type: 'array', items: { type: 'object' } },
        },
      },
      TripInput: { type: 'object', required: ['routeId', 'busId', 'departureTime', 'baseFare'], properties: { routeId: id, busId: id, departureTime: { type: 'string', format: 'date-time', example: '2026-12-01T21:30:00+05:30' }, baseFare: { type: 'number', example: 899 }, repeatDays: { type: 'integer', minimum: 1, maximum: 30, default: 1 } } },
      BookingInput: {
        type: 'object',
        required: ['tripId', 'boardingStopId', 'droppingStopId', 'contact', 'passengers'],
        description: 'No price, status or PNR fields are accepted — the server computes them.',
        properties: {
          tripId: id, boardingStopId: id, droppingStopId: id,
          contact: { type: 'object', properties: { email: str, phone: { type: 'string', example: '9876543210' } } },
          passengers: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', required: ['seatId', 'name', 'age', 'gender'], properties: { seatId: id, name: str, age: { type: 'integer', minimum: 1, maximum: 120 }, gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] } } } },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          _id: id, pnr: { type: 'string', example: 'BN7K2MQ9XA' }, status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] }, seatCount: num,
          fare: { type: 'object', properties: { baseFare: num, seatCharges: num, taxPercent: num, taxes: num, total: num } },
          payment: { type: 'object', properties: { method: str, reference: str, status: { type: 'string', enum: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'NOT_REFUNDED'] } } },
          passengers: { type: 'array', items: { type: 'object', properties: { name: str, age: num, gender: str, seatNumber: str, fare: num } } },
          trip: { type: 'object' }, route: { type: 'object' }, operator: { type: 'object' }, boardingPoint: { type: 'object' }, droppingPoint: { type: 'object' },
          cancellation: { ...ref('Cancellation'), nullable: true },
        },
      },
      RefundQuote: { type: 'object', properties: { allowed: bool, reason: str, hoursBeforeDeparture: num, refundPercent: num, refundAmount: num, cancellationFee: num, refundType: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE'] }, total: num } },
      Cancellation: { type: 'object', properties: { _id: id, reason: str, refundPercent: num, refundAmount: num, cancellationFee: num, refundStatus: { type: 'string', enum: ['PROCESSED', 'NOT_APPLICABLE'] }, refundReference: str, cancelledAt: { type: 'string', format: 'date-time' } } },
    },
  },
  paths: {
    '/auth/register': { post: op({ tag: 'Auth', summary: 'Register a passenger account', body: { type: 'object', required: ['name', 'email', 'password'], properties: { name: str, email: str, phone: str, password: { type: 'string', description: '8+ chars with upper, lower and a digit' } } }, bodyExample: { name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', password: 'Travel@123' }, responses: { 201: ok('Account created; refresh cookie set', ref('AuthSession')), 400: E[400], 409: err('Email already registered', 'EMAIL_EXISTS', 'An account with this email already exists'), 429: E[429] } }) },
    '/auth/login': { post: op({ tag: 'Auth', summary: 'Sign in', body: { type: 'object', required: ['email', 'password'], properties: { email: str, password: str } }, responses: { 200: ok('Signed in; refresh cookie set', ref('AuthSession')), 400: E[400], 401: err('Wrong email or password', 'INVALID_CREDENTIALS', 'Invalid email or password'), 429: E[429] } }) },
    '/auth/refresh': { post: op({ tag: 'Auth', summary: 'Rotate the refresh cookie and get a new access token', responses: { 200: ok('New session', ref('AuthSession')), 401: err('Refresh token missing, expired, revoked or reused', 'REFRESH_INVALID', 'Session expired. Please sign in again.') } }) },
    '/auth/logout': { post: op({ tag: 'Auth', summary: 'Revoke the refresh token and clear the cookie', responses: { 200: ok('Signed out') } }) },
    '/auth/me': {
      get: op({ tag: 'Auth', summary: 'Current user profile', roles: 'any signed-in user', responses: { 200: ok('Profile', ref('User')) } }),
      patch: op({ tag: 'Auth', summary: 'Update own name / phone', roles: 'any signed-in user', body: { type: 'object', properties: { name: str, phone: str } }, responses: { 200: ok('Updated profile', ref('User')), 400: E[400] } }),
    },
    '/auth/me/password': { patch: op({ tag: 'Auth', summary: 'Change password (signs out other sessions)', roles: 'any signed-in user', body: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: str, newPassword: str } }, responses: { 200: ok('Password changed'), 400: E[400] } }) },

    '/trips/search': { get: op({ tag: 'Trips', summary: 'Search trips between two cities on a date', params: [q('from', str, 'Source city', true), q('to', str, 'Destination city', true), q('date', { type: 'string', example: '2026-12-01' }, 'Journey date (IST), YYYY-MM-DD', true), q('passengers', { type: 'integer', minimum: 1, maximum: 6, default: 1 }), q('sort', { type: 'string', enum: ['departure', 'arrival', 'price', 'seats', 'duration', 'rating'] }), q('order', { type: 'string', enum: ['asc', 'desc'] }), q('busType', str, 'Comma separated: SEATER,SEMI_SLEEPER,SLEEPER'), q('ac', { type: 'string', enum: ['true', 'false'] }), q('departureSlot', str, 'Comma separated: EARLY,MORNING,AFTERNOON,NIGHT'), q('maxPrice', num), ...paging], responses: { 200: ok('Matching trips (empty list when none)', { type: 'array', items: ref('TripSearchResult') }, true), 400: E[400] } }) },
    '/trips': {
      get: op({ tag: 'Trips', summary: 'List trips for management, with occupancy', roles: 'ADMIN, OPERATOR (own trips)', params: [...paging, q('status', { type: 'string', enum: ['SCHEDULED', 'DEPARTED', 'COMPLETED', 'CANCELLED'] }), q('routeId', str), q('busId', str), q('from', str, 'YYYY-MM-DD'), q('to', str, 'YYYY-MM-DD')], responses: { 200: ok('Trips', { type: 'array', items: { type: 'object' } }, true) } }),
      post: op({ tag: 'Trips', summary: 'Schedule one trip or a daily series', roles: 'ADMIN, OPERATOR (own route and bus)', body: ref('TripInput'), responses: { 201: ok('Trips created', { type: 'object', properties: { created: num, tripIds: { type: 'array', items: str } } }), 400: E[400], 409: err('Bus already scheduled at that time', 'BUS_SCHEDULE_CONFLICT', 'This bus is already scheduled on an overlapping trip') } }),
    },
    '/trips/{id}': {
      get: op({ tag: 'Trips', summary: 'Trip details with boarding and dropping points', params: [idParam], responses: { 200: ok('Trip'), 404: E[404] } }),
      patch: op({ tag: 'Trips', summary: 'Change fare, reschedule or change status (cancelling refunds all bookings in full)', roles: 'ADMIN, OPERATOR (own trips)', params: [idParam], body: { type: 'object', properties: { baseFare: num, departureTime: { type: 'string', format: 'date-time' }, status: { type: 'string', enum: ['DEPARTED', 'COMPLETED', 'CANCELLED'] } } }, responses: { 200: ok('Trip updated'), 400: E[400], 404: E[404], 409: err('Invalid transition or trip has bookings', 'INVALID_TRIP_TRANSITION', 'A completed trip cannot become scheduled') } }),
    },
    '/trips/{id}/seats': { get: op({ tag: 'Trips', summary: 'Live seat map: every seat with AVAILABLE / BOOKED / UNAVAILABLE and its fare', params: [idParam], responses: { 200: ok('Seat map'), 404: E[404] } }) },
    '/trips/{id}/manifest': { get: op({ tag: 'Trips', summary: 'Passenger manifest for a trip', roles: 'ADMIN, OPERATOR (own trips)', params: [idParam], responses: { 200: ok('Manifest'), 404: E[404] } }) },

    '/bookings': {
      post: op({
        tag: 'Bookings', summary: 'Confirm a booking (concurrency-safe, idempotent)', roles: 'PASSENGER',
        params: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 64 }, description: 'Client-generated unique key for this booking attempt' }],
        body: ref('BookingInput'),
        bodyExample: { tripId: '665f1c2e9b1e8a0012a4c001', boardingStopId: '665f1c2e9b1e8a0012a4c010', droppingStopId: '665f1c2e9b1e8a0012a4c011', contact: { email: 'asha@example.com', phone: '9876543210' }, passengers: [{ seatId: '665f1c2e9b1e8a0012a4c101', name: 'Asha Rao', age: 29, gender: 'FEMALE' }] },
        responses: {
          201: ok('Booking confirmed', ref('Booking')),
          200: ok('Same Idempotency-Key replayed — original booking returned', ref('Booking')),
          400: E[400], 404: E[404],
          409: err('A seat was taken by another passenger (details.seats lists them), or the trip is closed', 'SEAT_ALREADY_BOOKED', 'Seat 3B was just booked by someone else. Please choose another seat.'),
          422: err('Idempotency-Key reused with a different payload', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different booking request'),
          429: E[429],
        },
      }),
      get: op({ tag: 'Bookings', summary: 'All bookings', roles: 'ADMIN, OPERATOR (own trips)', params: [...paging, q('status', { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] }), q('search', str, 'PNR, contact email or phone'), q('tripId', str)], responses: { 200: ok('Bookings', { type: 'array', items: { type: 'object' } }, true) } }),
    },
    '/bookings/me': { get: op({ tag: 'Bookings', summary: 'Own bookings', roles: 'PASSENGER', params: [...paging, q('status', { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] }), q('when', { type: 'string', enum: ['upcoming', 'past'] })], responses: { 200: ok('Bookings', { type: 'array', items: { type: 'object' } }, true) } }) },
    '/bookings/{id}': { get: op({ tag: 'Bookings', summary: 'Booking / ticket details', roles: 'owner PASSENGER, ADMIN, OPERATOR (own trips)', params: [idParam], responses: { 200: ok('Booking', ref('Booking')), 404: E[404] } }) },
    '/bookings/pnr/{pnr}': { get: op({ tag: 'Bookings', summary: 'Look up a booking by PNR', roles: 'owner PASSENGER, ADMIN, OPERATOR (own trips)', params: [{ name: 'pnr', in: 'path', required: true, schema: str }], responses: { 200: ok('Booking', ref('Booking')), 404: E[404] } }) },
    '/bookings/{id}/cancellation-quote': { get: op({ tag: 'Cancellations', summary: 'Preview the refund before cancelling', roles: 'owner PASSENGER, ADMIN', params: [idParam], responses: { 200: ok('Refund quote', ref('RefundQuote')), 404: E[404] } }) },
    '/bookings/{id}/cancel': { post: op({ tag: 'Cancellations', summary: 'Cancel a booking, release its seats and record the simulated refund', roles: 'owner PASSENGER, ADMIN', params: [idParam], body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 300 } } }, responses: { 200: ok('Cancelled', { type: 'object', properties: { cancellation: ref('Cancellation'), booking: ref('Booking') } }), 400: E[400], 404: E[404], 409: err('Already cancelled', 'ALREADY_CANCELLED', 'This booking has already been cancelled'), 422: err('Past the cancellation cut-off or trip departed', 'CANCELLATION_NOT_ALLOWED', 'Cancellation closes 2 hours before departure') } }) },
    '/cancellations': { get: op({ tag: 'Cancellations', summary: 'Cancellations and refunds (scoped to the caller)', roles: 'PASSENGER (own), OPERATOR (own trips), ADMIN (all)', params: paging, responses: { 200: ok('Cancellations', { type: 'array', items: ref('Cancellation') }, true) } }) },
    '/cancellations/policy': { get: op({ tag: 'Cancellations', summary: 'Current cancellation policy (cut-off and refund tiers)', responses: { 200: ok('Policy') } }) },

    '/operators/public': { get: op({ tag: 'Operators', summary: 'Active operators (public fields)', params: paging, responses: { 200: ok('Operators', { type: 'array', items: ref('Operator') }, true) } }) },
    '/operators': { get: operators.list, post: operators.create },
    '/operators/{id}': { patch: operators.update },
    '/buses': { get: buses.list, post: buses.create },
    '/buses/{id}': { get: op({ tag: 'Buses', summary: 'Bus with its full seat layout', roles: 'ADMIN, OPERATOR (own buses)', params: [idParam], responses: { 200: ok('Bus', ref('Bus')), 404: E[404] } }), patch: buses.update },
    '/buses/{id}/seats/{seatId}': { patch: op({ tag: 'Buses', summary: 'Enable/disable a seat or change its fare modifier', roles: 'ADMIN', params: [idParam, { name: 'seatId', in: 'path', required: true, schema: str }], body: { type: 'object', properties: { isActive: bool, priceModifier: num } }, responses: { 200: ok('Seat', ref('Seat')), 409: err('Seat is booked on an upcoming trip', 'SEAT_IN_USE', 'This seat is booked on an upcoming trip and cannot be disabled') } }) },
    '/routes/popular': { get: op({ tag: 'Routes', summary: 'Popular city pairs with lowest upcoming fare', responses: { 200: ok('Popular routes', { type: 'array', items: { type: 'object' } }) } }) },
    '/routes': { get: routes.list, post: routes.create },
    '/routes/{id}': { get: op({ tag: 'Routes', summary: 'Route details', roles: 'ADMIN, OPERATOR (own routes)', params: [idParam], responses: { 200: ok('Route', ref('Route')), 404: E[404] } }), patch: routes.update },
    '/stops/cities': { get: op({ tag: 'Stops', summary: 'Cities with at least one active stop', responses: { 200: ok('Cities', { type: 'array', items: str }) } }) },
    '/stops': { get: { ...stops.list, security: undefined, description: '**Access:** public' }, post: stops.create },
    '/stops/{id}': { patch: stops.update },
    '/users': { get: users.list, post: users.create },
    '/users/{id}': { patch: users.update },

    '/reports/dashboard': { get: op({ tag: 'Reports', summary: 'Dashboard metrics, route summary, 14-day trend, recent bookings', roles: 'ADMIN (all data), OPERATOR (own data)', responses: { 200: ok('Dashboard') } }) },
    '/reports/occupancy': { get: op({ tag: 'Reports', summary: 'Seat occupancy per trip and for the period', roles: 'ADMIN, OPERATOR (own trips)', params: [...paging, q('from', str, 'YYYY-MM-DD'), q('to', str, 'YYYY-MM-DD')], responses: { 200: ok('Occupancy', { type: 'array', items: { type: 'object' } }, true) } }) },
    '/reports/bookings': { get: op({ tag: 'Reports', summary: 'Booking totals and route-wise summary', roles: 'ADMIN, OPERATOR (own data)', params: [q('from', str, 'YYYY-MM-DD'), q('to', str, 'YYYY-MM-DD')], responses: { 200: ok('Summary') } }) },
    '/audit': { get: op({ tag: 'Audit', summary: 'Audit trail of sensitive actions', roles: 'ADMIN', params: [...paging, q('search', str, 'Action contains'), q('entityType', str)], responses: { 200: ok('Audit entries', { type: 'array', items: { type: 'object' } }, true) } }) },
  },
};
