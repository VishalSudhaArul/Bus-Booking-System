export type Role = 'ADMIN' | 'OPERATOR' | 'PASSENGER';
export type BusType = 'SEATER' | 'SEMI_SLEEPER' | 'SLEEPER';
export type LayoutTemplate = 'SEATER_2X2' | 'SEATER_2X1' | 'SEMI_SLEEPER_2X2' | 'SLEEPER_2X1' | 'SLEEPER_1X1';
export type TripStatus = 'SCHEDULED' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'UNAVAILABLE';
export type Deck = 'LOWER' | 'UPPER';

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  operatorId: string | null;
  operator?: { _id: string; name: string; code: string } | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Operator {
  _id: string;
  name: string;
  code: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  rating: number;
  isActive?: boolean;
  busCount?: number;
}

export interface Stop {
  _id: string;
  name: string;
  city: string;
  address?: string;
  landmark?: string;
  isActive: boolean;
}

export interface BusLayout {
  template: LayoutTemplate;
  rows: number;
  columns: number;
  aisleAfterColumn: number;
  decks: number;
}

export interface Seat {
  _id: string;
  seatNumber: string;
  deck: Deck;
  row: number;
  column: number;
  seatType: BusType;
  position: 'WINDOW' | 'AISLE';
  priceModifier: number;
  isActive: boolean;
}

export interface Bus {
  _id: string;
  operatorId: { _id: string; name: string; code: string };
  name: string;
  registrationNumber: string;
  busType: BusType;
  isAC: boolean;
  amenities: string[];
  layout: BusLayout;
  isActive: boolean;
  totalSeats?: number;
  activeSeats?: number;
  seats?: Seat[];
}

export interface RouteStop {
  stopId: { _id: string; name: string; city: string };
  type: 'BOARDING' | 'DROPPING';
  sequence: number;
  offsetMinutes: number;
}

export interface BusRoute {
  _id: string;
  operatorId: { _id: string; name: string; code: string };
  code: string;
  sourceCity: string;
  destinationCity: string;
  distanceKm: number;
  durationMinutes: number;
  stops: RouteStop[];
  isActive: boolean;
}

export interface TripPoint {
  stopId: string;
  name: string;
  city: string;
  landmark?: string;
  type: 'BOARDING' | 'DROPPING';
  time: string;
}

export interface TripSearchResult {
  _id: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  baseFare: number;
  minFare: number;
  maxFare: number;
  totalSeats: number;
  availableSeats: number;
  operator: { _id: string; name: string; rating: number };
  bus: { _id: string; name: string; busType: BusType; isAC: boolean; amenities: string[] };
  route: { sourceCity: string; destinationCity: string; distanceKm: number };
  boardingPoints: TripPoint[];
  droppingPoints: TripPoint[];
}

export interface TripDetails {
  _id: string;
  status: TripStatus;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  baseFare: number;
  totalSeats: number;
  availableSeats: number;
  bus: { _id: string; name: string; busType: BusType; isAC: boolean; amenities: string[]; layout: BusLayout; registrationNumber: string };
  operator: { _id: string; name: string; code: string; rating: number; contactPhone?: string };
  route: { _id: string; code: string; sourceCity: string; destinationCity: string; distanceKm: number; durationMinutes: number };
  boardingPoints: TripPoint[];
  droppingPoints: TripPoint[];
}

export interface TripSeat {
  _id: string;
  seatNumber: string;
  deck: Deck;
  row: number;
  column: number;
  seatType: BusType;
  position: 'WINDOW' | 'AISLE';
  fare: number;
  status: SeatStatus;
}

export interface TripSeatMap {
  tripId: string;
  bookable: boolean;
  baseFare: number;
  layout: BusLayout;
  seats: TripSeat[];
}

export interface ManagedTrip {
  _id: string;
  status: TripStatus;
  departureTime: string;
  arrivalTime: string;
  baseFare: number;
  bus: { _id: string; name: string; registrationNumber: string; busType: BusType; isAC: boolean };
  operator: { _id: string; name: string; code: string };
  route: { _id: string; code: string; sourceCity: string; destinationCity: string; durationMinutes: number };
  totalSeats: number;
  bookedSeats: number;
  occupancyPercent: number;
}

export interface Fare {
  baseFare: number;
  seatCharges: number;
  taxPercent: number;
  taxes: number;
  total: number;
}

export interface Cancellation {
  _id: string;
  reason: string;
  refundPercent: number;
  refundAmount: number;
  cancellationFee: number;
  refundStatus: 'PROCESSED' | 'NOT_APPLICABLE';
  refundReference?: string;
  cancelledAt: string;
  cancelledByRole: Role;
  hoursBeforeDeparture: number;
  booking?: { _id: string; pnr: string; seatCount: number; contactEmail: string; fare: { total: number }; routeId?: { sourceCity: string; destinationCity: string }; tripId?: { departureTime: string } };
  operator?: { _id: string; name: string };
}

export interface BookingPoint {
  _id: string;
  name: string;
  city: string;
  landmark?: string;
  time: string | null;
}

export interface Booking {
  _id: string;
  pnr: string;
  status: BookingStatus;
  seatCount: number;
  contactEmail: string;
  contactPhone: string;
  fare: Fare;
  payment: { method: string; reference: string; status: 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'NOT_REFUNDED' };
  createdAt: string;
  cancelledAt: string | null;
  bookedBy: { _id: string; name: string; email: string };
  operator: { _id: string; name: string; code: string; contactPhone?: string };
  route: { _id: string; code: string; sourceCity: string; destinationCity: string; distanceKm: number };
  trip: { _id: string; status: TripStatus; departureTime: string; arrivalTime: string; bus: { name: string; busType: BusType; isAC: boolean; registrationNumber: string } } | null;
  boardingPoint: BookingPoint;
  droppingPoint: BookingPoint;
  passengers: { _id: string; name: string; age: number; gender: Gender; seatNumber: string; fare: number }[];
  cancellation: Cancellation | null;
}

export interface BookingSummary {
  _id: string;
  pnr: string;
  status: BookingStatus;
  seatCount: number;
  total: number;
  paymentStatus: string;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
  operator: { _id: string; name: string } | null;
  route: { _id: string; sourceCity: string; destinationCity: string } | null;
  trip: { _id: string; departureTime: string; arrivalTime: string; status: TripStatus } | null;
  bookedBy: { _id: string; name: string; email: string } | null;
  seats: string[];
  leadPassenger: string;
}

export interface RefundQuote {
  allowed: boolean;
  reason?: string;
  hoursBeforeDeparture: number;
  refundPercent: number;
  refundAmount: number;
  cancellationFee: number;
  refundType: 'FULL' | 'PARTIAL' | 'NONE';
  total: number;
  policy: CancellationPolicy;
}

export interface CancellationPolicy {
  cutoffHours: number;
  tiers: { minHours: number; refundPercent: number }[];
}

export interface Manifest {
  trip: { _id: string; status: TripStatus; departureTime: string; arrivalTime: string; bus: { name: string; registrationNumber: string; busType: BusType; isAC: boolean }; operator: { name: string; code: string }; route: { code: string; sourceCity: string; destinationCity: string } };
  summary: { totalSeats: number; bookedSeats: number; availableSeats: number; occupancyPercent: number; bookings: number };
  passengers: { seatNumber: string; name: string; age: number; gender: Gender; pnr: string; contactPhone: string; boardingPoint: string; droppingPoint: string; fare: number }[];
}

export interface RouteSummaryRow {
  routeId: string;
  code: string;
  route: string;
  operator: string;
  bookings: number;
  confirmed: number;
  cancelled: number;
  seats: number;
  revenue: number;
}

export interface BookingTotals {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  seatsSold: number;
  revenue: number;
  refundsIssued: number;
  cancellationFees: number;
}

export interface Dashboard {
  stats: BookingTotals & {
    scheduledTrips: number;
    totalTrips: number;
    totalBuses: number;
    occupancyPercent: number;
    seatsOffered: number;
    seatsFilled: number;
    activeOperators?: number;
    passengers?: number;
  };
  routeSummary: RouteSummaryRow[];
  trend: { date: string; bookings: number; revenue: number }[];
  recentBookings: { _id: string; pnr: string; status: BookingStatus; seatCount: number; total: number; createdAt: string; route: { sourceCity: string; destinationCity: string } | null; passenger: string }[];
}

export interface AuditEntry {
  _id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorRole?: string;
  actorId?: { _id: string; name: string; email: string } | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PopularRoute {
  sourceCity: string;
  destinationCity: string;
  durationMinutes: number;
  distanceKm: number;
  minFare: number;
  trips: number;
  bookings: number;
}
