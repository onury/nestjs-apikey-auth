# nestjs-apikey-auth

<p align="center">
  <a href="https://github.com/onury/nestjs-apikey-auth/actions/workflows/ci.yml"><img src="https://github.com/onury/nestjs-apikey-auth/actions/workflows/ci.yml/badge.svg" alt="build" /></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-100%25-2BB150?logo=vitest&logoColor=%23FDC72B&style=flat" alt="coverage" /></a>
  <a href="https://stryker-mutator.io/"><img src="https://img.shields.io/badge/mutation-100%25-2BB150?style=flat" alt="mutation score" /></a>
  <a href="https://www.npmjs.com/package/nestjs-apikey-auth"><img src="https://img.shields.io/npm/v/nestjs-apikey-auth.svg?style=flat&label=&color=%23C6234B&logo=npm" alt="version" /></a>
  <a href="https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7"><img src="https://img.shields.io/badge/ESM-F7DF1E?style=flat" alt="ESM" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TS-3260C7?style=flat" alt="TypeScript" /></a>
  <a href="https://github.com/onury/nestjs-apikey-auth/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="license" /></a>
</p>

**Passport-free** API-key authentication for [NestJS](https://nestjs.com): opaque, **hashed-at-rest** keys with scopes, optional expiry, and **instant revocation**, behind a default-deny guard — for machine, service, and third-party callers. Wired with a single `forRoot()`.

> **ESM-only.** Requires Node ≥ 20 and NestJS 10 / 11.
>
> This is the **machine / third-party** half. For human user sessions use the siblings: stateless JWTs (`nestjs-jwt-guard`) or opaque login tokens (`nestjs-oauth2-password`). They compose — run an API-key guard and a user-session guard side by side.

## Why

An API key is a **pre-shared, long-lived** secret minted out-of-band (a dashboard) — no login flow, and the principal is an *app or service*, not a logged-in user. That makes it the right tool for **service-to-service** calls, a **public/partner API** (per-key identity, scopes, instant revoke), **webhooks**, and **CLI/CI** (`MYAPP_API_KEY` in an env var) — exactly where a JWT's short TTL + refresh dance is friction.

Keys are **opaque** and looked up by hash on every request, so revocation is instant and the key's state is always live. The package mints keys and runs the flow; **you** own persistence (so revocation is real). Keys are stored as a SHA-256 hash — never in plaintext.

> Don't use an API key for browser SPAs / end-users (a key can't be hidden client-side → use a user-session token).

## Install

```bash
npm install nestjs-apikey-auth
```

`@nestjs/common`, `@nestjs/core`, and `reflect-metadata` are peer dependencies (already in any Nest app).

## Quick start

Register once — it registers the guard globally. Every route now requires `Authorization: ApiKey <key>`:

```ts
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nestjs-apikey-auth';
import { ApiKeyStoreService } from './apikey-store.service';

@Module({
  imports: [
    ApiKeyModule.forRootAsync({
      inject: [ApiKeyStoreService],
      useFactory: (store: ApiKeyStoreService) => ({ store }),
    }),
  ],
})
export class AppModule {}
```

**Issue a key** (e.g. from an admin endpoint) — the raw key is returned **once**; only its hash is stored:

```ts
import { ApiKeyService } from 'nestjs-apikey-auth';

constructor(private readonly apiKeys: ApiKeyService) {}

async createKey(ownerId: string) {
  const { key } = await this.apiKeys.issue(
    { id: crypto.randomUUID(), ownerId, scopes: ['billing:read'], name: 'CI deploy key' },
    { prefix: 'sk_live' }, // → "sk_live_<256-bit>"
  );
  return { apiKey: key }; // show once — you cannot recover it later
}
```

**Protect routes**, exempt public ones with `@Public()`, gate by scope with `@RequireScopes()`, and read the key with `@ApiKey()`:

```ts
import { ApiKey, Public, RequireScopes, type ApiKeyRecord } from 'nestjs-apikey-auth';

@Public()
@Get('health')
health() { return { ok: true }; }

@RequireScopes('billing:read')        // valid key lacking the scope ⇒ 403
@Get('invoices')
invoices(@ApiKey() key: ApiKeyRecord) {
  return this.invoices.forOwner(key.ownerId);
}
```

A missing/invalid/expired key ⇒ `401`; a valid key without a required scope ⇒ `403`.

## The store seam

The package stores nothing — you implement one `ApiKeyStore`, backed by your DB. Look up by **hash** (`hashApiKey` is exported), and persist only the hash:

```ts
import { Injectable } from '@nestjs/common';
import {
  type ApiKeyRecord,
  type ApiKeyStore,
  type IssuedApiKey,
} from 'nestjs-apikey-auth';

@Injectable()
export class ApiKeyStoreService implements ApiKeyStore {
  constructor(private readonly db: PrismaService) {}

  async findByHash(hash: string): Promise<ApiKeyRecord | null> {
    const row = await this.db.apiKey.findFirst({ where: { keyHash: hash, revokedDate: null } });
    return row && { id: row.id, ownerId: row.ownerId, name: row.name, scopes: row.scopes, expiryDate: row.expiryDate };
  }

  save(key: IssuedApiKey) {              // optional — used by ApiKeyService.issue
    return this.db.apiKey.create({ data: { ...key } });
  }

  revoke(id: string) {                  // instant — takes effect next request
    return this.db.apiKey.update({ where: { id }, data: { revokedDate: new Date() } });
  }

  touch(id: string, at: Date) {         // optional — last-used, called fire-and-forget
    return this.db.apiKey.update({ where: { id }, data: { lastUsedDate: at } });
  }
}
```

> Mint and hash keys yourself (without `ApiKeyService`) using the exported `generateApiKey` / `hashApiKey` / `parseDisplayPrefix` — they're framework-free, so they also work in a Lambda or CLI.

## Scopes

`scopes` are opaque strings on each key. `@RequireScopes(a, b)` requires **all** of them (AND). Wildcards: a granted `'*'` satisfies anything; a granted `'billing:*'` satisfies `'billing:read'`, `'billing:write'`, … Matching is case-sensitive.

Scopes compose with [`nestjs-accesscontrol`](https://github.com/onury/nestjs-accesscontrol) and are **orthogonal**: scopes gate *which keys* may call an endpoint; access-control gates *what the resolved principal may do*. Use a `resolvePrincipal` callback to also populate `req.user` from a key for the authZ layer.

## Configuration

```ts
ApiKeyModule.forRoot({
  store,                         // your ApiKeyStore (required)
  header: 'Authorization',       // header to read (default)
  scheme: 'ApiKey',              // auth scheme; '' reads the raw header value (default 'ApiKey')
  allowQuery: false,             // also accept ?api_key=… — leaks to logs (default false)
  queryParam: 'api_key',         // query param name when allowQuery (default)
  extractors: undefined,         // custom ordered extractors; overrides header/query entirely
  attachTo: 'apiKey',            // request property the key record is attached to (default)
  resolvePrincipal: undefined,   // optional: (record) => req.user
  registerGuard: true,           // register the guard globally via APP_GUARD (default)
  isGlobal: true,                // module is global (default)
});
```

| Option | Default | Description |
| --- | --- | --- |
| `store` | — | Your `ApiKeyStore` — `findByHash` / `revoke` / optional `touch` / optional `save` (required). |
| `header` | `'Authorization'` | Header the key is read from. |
| `scheme` | `'ApiKey'` | Auth scheme/prefix (case-insensitive); `''` reads the raw header value. |
| `allowQuery` | `false` | Also accept the key from a query param (it leaks into logs — opt-in). |
| `queryParam` | `'api_key'` | Query param name when `allowQuery`. |
| `extractors` | header (+ query) | Ordered extractors, first non-empty wins; overrides `header`/`query` when set. |
| `attachTo` | `'apiKey'` | Request property the key record is attached to. |
| `resolvePrincipal` | — | Resolve the record to a principal attached at `req.user`. |
| `registerGuard` | `true` | Register the guard globally via `APP_GUARD`. |
| `isGlobal` | `true` | Register the module globally. |

## Per-route use

Disable the global guard (`registerGuard: false`) and apply per-controller — the guard is exported:

```ts
@UseGuards(ApiKeyGuard)
@Controller('partner')
export class PartnerController {}
```

## API

**Module & enforcement**

| Export | Description |
| --- | --- |
| `ApiKeyModule.forRoot(options)` / `forRootAsync(options)` | Configure the store + behavior. See [Configuration](#configuration). |
| `ApiKeyGuard` | The default-deny guard. Global by default; exported for per-route `@UseGuards`. |
| `ApiKeyService` | `issue(record, generate?)` → `{ key, issued }`, `revoke(id)`. |
| `@Public()` · `@RequireScopes(...)` · `@ApiKey()` | Exempt a route · require scopes (403) · inject the key record. |
| `IS_PUBLIC_KEY` · `REQUIRE_SCOPES_KEY` | Metadata keys (for custom reflection). |

**Helpers (framework-free) & advanced**

| Export | Description |
| --- | --- |
| `generateApiKey({ prefix?, bytes? })` | Mint a labelled, high-entropy opaque key (default 256-bit). |
| `hashApiKey(key)` | SHA-256 hex — store & look up keys by this. |
| `parseDisplayPrefix(key, headChars?)` | Non-secret leading slice for dashboards. |
| `scopeSatisfies(required, granted)` · `isExpired(date, now?)` | Scope-matching & expiry helpers. |
| `headerExtractor(header, scheme)` · `queryExtractor(param)` | Build custom `extractors`. |
| `APIKEY_OPTIONS` · `resolveOptions(options)` | DI token & options resolver. |

**Types** — `ApiKeyStore`, `ApiKeyRecord`, `IssuedApiKey`, `AuthenticatedRequest`, `ApiKeyOptions`, `ApiKeyAsyncOptions`, `ApiKeyBehavior`, `ApiKeyProviders`, `ResolvedApiKeyOptions`, `ApiKeyExtractor`, `GenerateApiKeyOptions`.

## Related Projects

- [**nestjs-jwt-guard**](https://github.com/onury/nestjs-jwt-guard) — Stateless bearer-JWT auth for user sessions.
- [**nestjs-oauth2-password**](https://github.com/onury/nestjs-oauth2-password) — OAuth2 ROPC: opaque, revocable login tokens for first-party users.
- [**nestjs-credentials**](https://github.com/onury/nestjs-credentials) — Token-agnostic username/password verification.
- [**nestjs-accesscontrol**](https://github.com/onury/nestjs-accesscontrol) — RBAC + ABAC authorization (AccessControl v3); composes with key scopes.
- [**nestjs-http-envelope**](https://github.com/onury/nestjs-http-envelope) — A uniform response & error envelope for NestJS.

## License

[MIT](./LICENSE) © Onur Yıldırım
