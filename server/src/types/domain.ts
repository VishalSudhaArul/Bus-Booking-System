export const ROLES = ['ADMIN', 'OPERATOR', 'PASSENGER'] as const;
export type Role = (typeof ROLES)[number];

export const BUS_TYPES = ['SEATER', 'SEMI_SLEEPER', 'SLEEPER'] as const;
export type BusType = (typeof BUS_TYPES)[number];

export const LAYOUT_TEMPLATES = ['SEATER_2X2', 'SEATER_2X1', 'SEMI_SLEEPER_2X2', 'SLEEPER_2X1', 'SLEEPER_1X1'] as const;
export type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number];

export const DECKS = ['LOWER', 'UPPER'] as const;
export type Deck = (typeof DECKS)[number];

export const SEAT_TYPES = ['SEATER', 'SEMI_SLEEPER', 'SLEEPER'] as const;
export const SEAT_POSITIONS = ['WINDOW', 'AISLE'] as const;

export const STOP_TYPES = ['BOARDING', 'DROPPING'] as const;
export type StopType = (typeof STOP_TYPES)[number];

export const TRIP_STATUSES = ['SCHEDULED', 'DEPARTED', 'COMPLETED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'NOT_REFUNDED'] as const;
export const ALLOCATION_STATUSES = ['ACTIVE', 'RELEASED'] as const;
export const REFUND_STATUSES = ['PROCESSED', 'NOT_APPLICABLE'] as const;
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

export interface Actor {
  id: string;
  role: Role;
  operatorId?: string;
  ip?: string;
}
