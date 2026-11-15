import { api } from '@/lib/api';
import type {
  AuditEntry,
  Booking,
  BookingSummary,
  BookingTotals,
  Bus,
  BusRoute,
  Cancellation,
  CancellationPolicy,
  Dashboard,
  FareQuote,
  PromoOffer,
  ManagedTrip,
  Manifest,
  Operator,
  PopularRoute,
  RefundQuote,
  RouteSummaryRow,
  Seat,
  Stop,
  TripDetails,
  TripSearchResult,
  TripSeatMap,
  User,
} from '@/types';

type Params = Record<string, string | number | boolean | undefined | null | string[]>;
interface Session {
  user: User;
  accessToken: string;
}

export const authApi = {
  login: (body: { email: string; password: string }) => api.post<Session>('/auth/login', body, { noRetry: true }),
  register: (body: { name: string; email: string; phone?: string; password: string }) => api.post<Session>('/auth/register', body, { noRetry: true }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout', {}, { noRetry: true }),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (body: { name?: string; phone?: string }) => api.patch<User>('/auth/me', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) => api.patch<{ passwordChanged: boolean }>('/auth/me/password', body),
};

export const catalogApi = {
  cities: () => api.get<string[]>('/stops/cities'),
  popularRoutes: () => api.get<PopularRoute[]>('/routes/popular'),
  operators: () => api.page<Operator>('/operators/public', { limit: 12 }),
  policy: () => api.get<CancellationPolicy>('/cancellations/policy'),
  promos: () => api.get<PromoOffer[]>('/promos'),
};

export const tripApi = {
  search: (params: Params) => api.page<TripSearchResult>('/trips/search', params),
  details: (id: string) => api.get<TripDetails>(`/trips/${id}`),
  seats: (id: string) => api.get<TripSeatMap>(`/trips/${id}/seats`),
  list: (params: Params) => api.page<ManagedTrip>('/trips', params),
  create: (body: { routeId: string; busId: string; departureTime: string; baseFare: number; repeatDays: number }) => api.post<{ created: number; tripIds: string[] }>('/trips', body),
  update: (id: string, body: { baseFare?: number; departureTime?: string; status?: string }) => api.patch<ManagedTrip & { cancelledBookings: number }>(`/trips/${id}`, body),
  manifest: (id: string) => api.get<Manifest>(`/trips/${id}/manifest`),
};

export interface BookingRequest {
  tripId: string;
  boardingStopId: string;
  droppingStopId: string;
  contact: { email: string; phone: string };
  passengers: { seatId: string; name: string; age: number; gender: string }[];
  promoCode?: string;
}

export const bookingApi = {
  fareQuote: (body: { tripId: string; seatIds: string[]; promoCode?: string }) => api.post<FareQuote>('/bookings/quote', body),
  create: (body: BookingRequest, idempotencyKey: string) => api.post<Booking>('/bookings', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  mine: (params: Params) => api.page<BookingSummary>('/bookings/me', params),
  list: (params: Params) => api.page<BookingSummary>('/bookings', params),
  get: (id: string) => api.get<Booking>(`/bookings/${id}`),
  quote: (id: string) => api.get<RefundQuote>(`/bookings/${id}/cancellation-quote`),
  cancel: (id: string, reason: string) => api.post<{ booking: Booking; cancellation: Cancellation }>(`/bookings/${id}/cancel`, { reason }),
  cancellations: (params: Params) => api.page<Cancellation>('/cancellations', params),
};

export const adminApi = {
  operators: (params: Params) => api.page<Operator>('/operators', params),
  createOperator: (body: Partial<Operator>) => api.post<Operator>('/operators', body),
  updateOperator: (id: string, body: Partial<Operator>) => api.patch<Operator>(`/operators/${id}`, body),

  users: (params: Params) => api.page<User>('/users', params),
  createUser: (body: Record<string, unknown>) => api.post<User>('/users', body),
  updateUser: (id: string, body: Record<string, unknown>) => api.patch<User>(`/users/${id}`, body),

  stops: (params: Params) => api.page<Stop>('/stops', params),
  createStop: (body: Partial<Stop>) => api.post<Stop>('/stops', body),
  updateStop: (id: string, body: Partial<Stop>) => api.patch<Stop>(`/stops/${id}`, body),

  routes: (params: Params) => api.page<BusRoute>('/routes', params),
  createRoute: (body: Record<string, unknown>) => api.post<BusRoute>('/routes', body),
  updateRoute: (id: string, body: Record<string, unknown>) => api.patch<BusRoute>(`/routes/${id}`, body),

  buses: (params: Params) => api.page<Bus>('/buses', params),
  bus: (id: string) => api.get<Bus>(`/buses/${id}`),
  createBus: (body: Record<string, unknown>) => api.post<Bus>('/buses', body),
  updateBus: (id: string, body: Record<string, unknown>) => api.patch<Bus>(`/buses/${id}`, body),
  updateSeat: (busId: string, seatId: string, body: { isActive?: boolean; priceModifier?: number; ladiesOnly?: boolean }) => api.patch<Seat>(`/buses/${busId}/seats/${seatId}`, body),

  audit: (params: Params) => api.page<AuditEntry>('/audit', params),
};

export const reportApi = {
  dashboard: () => api.get<Dashboard>('/reports/dashboard'),
  occupancy: (params: Params) => api.page<ManagedTrip>('/reports/occupancy', params),
  bookings: (params: Params) => api.get<{ totals: BookingTotals; routes: RouteSummaryRow[] }>('/reports/bookings', params),
};
