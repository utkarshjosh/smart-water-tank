import type { z } from 'zod';

/** Thrown when a response does not match its @aquamind/contracts schema. */
export class ContractError extends Error {
  readonly url: string;
  readonly issues: string[];

  constructor(url: string, issues: string[]) {
    super(`Unexpected response shape from ${url}: ${issues.slice(0, 3).join('; ')}`);
    this.name = 'ContractError';
    this.url = url;
    this.issues = issues;
  }
}

/**
 * Parse a response body against its contract. Fails fast: a shape mismatch
 * becomes a thrown error that react-query's existing `isError` path renders,
 * instead of a crash on the first missing property or a feature that is
 * silently unreachable (#15). Kept free of axios and Firebase so it can be
 * unit-tested on its own.
 */
export function parseResponse<S extends z.ZodType>(schema: S, data: unknown, url: string): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ContractError(
      url,
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
    );
  }
  return result.data;
}
