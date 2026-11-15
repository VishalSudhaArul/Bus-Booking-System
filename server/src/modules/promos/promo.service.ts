import { badRequest } from '../../utils/errors';
import { round2 } from '../../utils/time';

export interface Promo {
  code: string;
  description: string;
  /** Percentage off the pre-tax subtotal. */
  percentOff?: number;
  /** Flat amount off the pre-tax subtotal (INR). */
  flatOff?: number;
  /** Cap for percentage discounts (INR). */
  maxDiscount?: number;
  /** Minimum pre-tax subtotal required (INR). */
  minSubtotal: number;
}

/**
 * Active promo codes. Discounts are always computed here on the server; the
 * client only ever sends the code, never an amount.
 */
export const PROMOS: Promo[] = [
  { code: 'SAVE10', description: '10% off, up to ₹150', percentOff: 10, maxDiscount: 150, minSubtotal: 300 },
  { code: 'FLAT50', description: '₹50 off bookings of ₹500 or more', flatOff: 50, minSubtotal: 500 },
];

export const normalisePromoCode = (code: string) => code.trim().toUpperCase();

/** Returns the discount for `code` on a pre-tax `subtotal`, or throws a 400 the UI can show. */
export function applyPromo(code: string, subtotal: number): { code: string; discount: number; description: string } {
  const promo = PROMOS.find((p) => p.code === normalisePromoCode(code));
  if (!promo) throw badRequest('This promo code is not valid', 'INVALID_PROMO');
  if (subtotal < promo.minSubtotal) {
    throw badRequest(`${promo.code} needs a fare of at least ₹${promo.minSubtotal} before tax`, 'PROMO_MIN_NOT_MET');
  }
  const raw = promo.percentOff ? (subtotal * promo.percentOff) / 100 : (promo.flatOff ?? 0);
  const discount = round2(Math.min(raw, promo.maxDiscount ?? Infinity, subtotal));
  return { code: promo.code, discount, description: promo.description };
}

export const listPromos = () => PROMOS.map(({ code, description, minSubtotal }) => ({ code, description, minSubtotal }));
