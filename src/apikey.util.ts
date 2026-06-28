import { createHash, randomBytes } from 'node:crypto';

/**
 * These helpers are deliberately **framework-free** (no `@nestjs/*` import), so
 * they can be imported on their own — `import { generateApiKey, hashApiKey } from
 * 'nestjs-apikey-auth'` — from a Lambda, CLI, or non-Nest server, without pulling
 * NestJS into the runtime. The guard/module/decorators build on top of these.
 */

/** Options for {@link generateApiKey}. */
export interface GenerateApiKeyOptions {
  /** Non-secret label prefixed before the random body, e.g. `'sk_live'` → `sk_live_<body>`. */
  prefix?: string;
  /** Entropy in bytes. Default `32` (256-bit). */
  bytes?: number;
}

/**
 * Mint a high-entropy opaque API key. With a `prefix` you get a labelled,
 * self-identifying key (`sk_live_…`, Stripe-style); without one, just the body.
 * The body is a URL-safe 256-bit string by default. This is the value shown to
 * the user **once** — persist only its {@link hashApiKey hash}.
 */
export function generateApiKey(options: GenerateApiKeyOptions = {}): string {
  const body = randomBytes(options.bytes ?? 32).toString('base64url');
  return options.prefix ? `${options.prefix}_${body}` : body;
}

/**
 * SHA-256 a key to a hex digest for storage and lookup. Persist `hashApiKey(key)`,
 * never the raw key; look up incoming keys by the same hash so a database leak
 * exposes nothing usable. A fast hash is correct here (unlike passwords): the key
 * is 256-bit random, so there is no low-entropy preimage to brute-force — which is
 * why the hash is fixed, not pluggable.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * The non-secret leading slice of a key, safe to persist for dashboards ("which
 * key is this?"). Far too little of the key to be guessable. Default 12 chars.
 */
export function parseDisplayPrefix(key: string, headChars = 12): string {
  return key.slice(0, headChars);
}

/** True if `date` is at or before `now` — i.e. the key has expired. */
export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() <= now.getTime();
}

/**
 * Does a set of `granted` scopes satisfy all `required` scopes? Case-sensitive,
 * opaque strings, AND semantics. Special cases:
 * - empty `required` ⇒ `true` (no scope gate).
 * - `'*'` in `granted` ⇒ satisfies anything.
 * - a trailing `':*'` is a prefix wildcard: granted `billing:*` satisfies required
 *   `billing:read`.
 */
export function scopeSatisfies(required: readonly string[], granted: readonly string[]): boolean {
  if (required.length === 0) return true;
  if (granted.includes('*')) return true;
  const wildcards = granted
    .filter((scope) => scope.endsWith(':*'))
    .map((scope) => scope.slice(0, -1));
  return required.every(
    (scope) => granted.includes(scope) || wildcards.some((prefix) => scope.startsWith(prefix))
  );
}
