import { describe, expect, it } from 'vitest';
import { stripMongoOperators } from '../src/middleware/security';
import { calculateFare } from '../src/modules/bookings/booking.service';
import { generateSeats } from '../src/modules/seats/seat.service';
import { pnrGenerator } from '../src/utils/pnr';
import { istDateString, istDayRange } from '../src/utils/time';
import { api } from './helpers/factory';

describe('seat layout generation', () => {
  it('builds a 2+2 seater with row/letter numbering and window flags', () => {
    const seats = generateSeats({ template: 'SEATER_2X2', rows: 10, windowPremium: 40 });
    expect(seats).toHaveLength(40);
    expect(seats.slice(0, 4).map((s) => s.seatNumber)).toEqual(['1A', '1B', '1C', '1D']);
    expect(seats.slice(0, 4).map((s) => s.position)).toEqual(['WINDOW', 'AISLE', 'AISLE', 'WINDOW']);
    expect(seats.slice(0, 4).map((s) => s.priceModifier)).toEqual([40, 0, 0, 40]);
    expect(new Set(seats.map((s) => s.seatNumber)).size).toBe(40);
  });

  it('builds a two-deck 2+1 sleeper with a lower-deck premium', () => {
    const seats = generateSeats({ template: 'SLEEPER_2X1', rows: 6, lowerDeckPremium: 150 });
    expect(seats).toHaveLength(36);
    expect(seats.filter((s) => s.deck === 'LOWER')).toHaveLength(18);
    expect(seats[0]).toMatchObject({ seatNumber: 'L1', deck: 'LOWER', seatType: 'SLEEPER', priceModifier: 150 });
    expect(seats[18]).toMatchObject({ seatNumber: 'U1', deck: 'UPPER', priceModifier: 0 });
  });
});

describe('fare calculation', () => {
  it('adds seat charges and tax, rounded to paise', () => {
    expect(calculateFare(499.5, [0, 25, 75], 5)).toEqual({ baseFare: 1498.5, seatCharges: 100, taxPercent: 5, taxes: 79.93, total: 1678.43 });
    expect(calculateFare(300, [0], 0)).toEqual({ baseFare: 300, seatCharges: 0, taxPercent: 0, taxes: 0, total: 300 });
  });
});

describe('utilities', () => {
  it('generates well-formed PNRs without ambiguous characters', () => {
    const pnrs = Array.from({ length: 500 }, () => pnrGenerator.next());
    expect(pnrs.every((p) => /^BN[2-9A-HJ-NP-Z]{8}$/.test(p))).toBe(true);
    expect(new Set(pnrs).size).toBe(500);
  });

  it('maps IST calendar days to the right UTC window', () => {
    const { start, end } = istDayRange('2026-12-01');
    expect(start.toISOString()).toBe('2026-11-30T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-12-01T18:30:00.000Z');
    expect(istDateString(new Date('2026-11-30T19:00:00.000Z'))).toBe('2026-12-01');
  });

  it('strips MongoDB operators from untrusted input', () => {
    const dirty = { email: { $gt: '' }, 'a.b': 1, nested: [{ $where: 'x', ok: 1 }], fine: 'yes' };
    expect(stripMongoOperators(dirty)).toEqual({ email: {}, nested: [{ ok: 1 }], fine: 'yes' });
  });
});

describe('API error handling', () => {
  it('returns the standard envelope for unknown routes', async () => {
    const res = await api().get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.body.data.transactions).toBe(true);
  });

  it('only allows the configured origin through CORS', async () => {
    const allowed = await api().get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await api().get('/health').set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await api().get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/bookings'].post).toBeDefined();
  });
});
