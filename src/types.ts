/**
 * The package owns the API-key *flow* — extraction, hash lookup, expiry, scope
 * enforcement, the guard — and delegates persistence to a single {@link ApiKeyStore}
 * seam. Keys are **opaque and hashed at rest**: an admin/dashboard mints a key with
 * {@link generateApiKey}, the raw value is shown once, and only its hash is stored.
 */

/** A persisted key as returned by a lookup. No secret material — already matched by hash. */
export interface ApiKeyRecord<TMeta = unknown> {
  /** Stable id, for `revoke()`/`touch()` and dashboards. */
  id: string;
  /** The principal (service/app/account) this key belongs to. */
  ownerId: string;
  /** Human label, e.g. `"CI deploy key"`. */
  name?: string;
  /** Granted scopes (opaque strings; AND semantics, `':*'` prefix-wildcard, `'*'` super). */
  scopes: string[];
  /** Absolute expiry. `null`/`undefined` ⇒ never expires. */
  expiryDate?: Date | null;
  /** App passthrough (plan, rate-limit tier, …) surfaced on `req.apiKey`. */
  meta?: TMeta;
}

/** What the app persists at issue time — `keyHash` is the lookup key. */
export interface IssuedApiKey<TMeta = unknown> extends ApiKeyRecord<TMeta> {
  /** `hashApiKey(rawKey)` — the sha256 hex the store looks up by. */
  keyHash: string;
  /** Non-secret head for dashboards, e.g. `"sk_live_a1b2…"`. */
  displayPrefix?: string;
}

/**
 * The one persistence seam — back it with Prisma/TypeORM/Redis/anything. The
 * package stores nothing itself. `findByHash` returning `null` rejects the request
 * (401); the package additionally treats an `expiryDate` in the past as expired.
 */
export interface ApiKeyStore<TMeta = unknown> {
  /** Look up a key by its hash. `null` ⇒ unknown key ⇒ 401. */
  findByHash(hash: string): Promise<ApiKeyRecord<TMeta> | null> | ApiKeyRecord<TMeta> | null;
  /** Revoke a key by id — instant, since auth is a per-request lookup. */
  revoke(id: string): Promise<void> | void;
  /** Optional last-used tracking; called fire-and-forget by the guard. */
  touch?(id: string, at: Date): Promise<void> | void;
  /** Optional; used by {@link ApiKeyService.issue} to persist a freshly minted key. */
  save?(key: IssuedApiKey<TMeta>): Promise<void> | void;
}

/** A request after the guard has attached the principal. */
export interface AuthenticatedRequest<TMeta = unknown> {
  apiKey?: ApiKeyRecord<TMeta>;
  /** Populated only when a `resolvePrincipal` callback is configured. */
  user?: unknown;
  [key: string]: unknown;
}
