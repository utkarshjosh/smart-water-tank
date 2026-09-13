import * as crypto from 'crypto';

// Excludes ambiguous characters (0/O/1/I/L) since this gets hand-typed into a
// device's setup portal.
const CLAIM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CLAIM_CODE_LENGTH = 8;
export const CLAIM_CODE_TTL_MS = 10 * 60 * 1000;

export function generateClaimCode(): string {
  let code = '';
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    // randomInt is uniform; `byte % 31` would favour the first 8 characters.
    code += CLAIM_CODE_ALPHABET[crypto.randomInt(CLAIM_CODE_ALPHABET.length)];
  }
  return code;
}

export function hashClaimCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}
