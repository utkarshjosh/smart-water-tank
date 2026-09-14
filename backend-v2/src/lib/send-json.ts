import type { Response } from 'express';
import type { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from './http-error';

/**
 * A response payload as the handler builds it: the contract's wire shape, but
 * with a Date allowed wherever the wire has a string, because res.json()
 * serialises Dates to ISO strings. Structural, so a missing or wrongly typed
 * field fails to compile — the drift the contracts exist to catch.
 */
export type Wire<T> = T extends string
  ? T | Date
  : T extends readonly (infer U)[]
    ? readonly Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/**
 * res.json() through the contract. In development and test the serialised
 * payload is parsed against the schema and a mismatch is a 500 with the
 * issues attached, so a route test fails the moment a handler and its
 * contract disagree. In production the parse is skipped: the types have
 * already done their job at build time, and the extra pass would cost on
 * every request for nothing new.
 */
export function sendJson<S extends z.ZodType>(res: Response, schema: S, payload: Wire<z.output<S>>, status = 200): void {
  if (env.nodeEnv !== 'production') {
    const wire: unknown = JSON.parse(JSON.stringify(payload));
    const result = schema.safeParse(wire);
    if (!result.success) {
      throw new HttpError(
        500,
        'Response does not match its contract',
        result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      );
    }
  }
  res.status(status).json(payload);
}
