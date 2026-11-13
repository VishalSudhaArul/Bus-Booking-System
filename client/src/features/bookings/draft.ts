/**
 * The in-progress booking (trip, seats, stops) survives a login redirect or a
 * page refresh by living in sessionStorage. It holds selections only — prices
 * and availability are always re-read from the server.
 */
export interface BookingDraft {
  tripId: string;
  seatIds: string[];
  boardingStopId: string;
  droppingStopId: string;
  /** One key per checkout attempt: retries of the same submit cannot double-book. */
  idempotencyKey: string;
}

const KEY = 'busnest.checkout';

export const newIdempotencyKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

export function saveDraft(draft: Omit<BookingDraft, 'idempotencyKey'>): BookingDraft {
  const full = { ...draft, idempotencyKey: newIdempotencyKey() };
  sessionStorage.setItem(KEY, JSON.stringify(full));
  return full;
}

export function loadDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BookingDraft;
    return draft.tripId && Array.isArray(draft.seatIds) && draft.seatIds.length > 0 ? draft : null;
  } catch {
    return null;
  }
}

export const clearDraft = () => sessionStorage.removeItem(KEY);
