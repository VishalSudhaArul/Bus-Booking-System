import { randomInt } from 'crypto';

// No 0/O/1/I to keep PNRs unambiguous when read aloud or printed.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * PNR generator. Exposed as an object so tests can stub `next()` and prove the
 * booking service retries when the unique index rejects a collision.
 */
export const pnrGenerator = {
  next(): string {
    let out = 'BN';
    for (let i = 0; i < 8; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
    return out;
  },
};
