import type { ModuleMetadata } from '@nestjs/common';
import type { ApiKeyRecord, ApiKeyStore } from './types';

/** Pulls the raw key string from the request. Return falsy ⇒ this source had no key. */
export type ApiKeyExtractor = (request: any) => string | undefined | null;

/** Build an extractor for `<header>: <scheme> <key>` (case-insensitive scheme; `scheme: ''` ⇒ raw value). */
export function headerExtractor(header: string, scheme: string): ApiKeyExtractor {
  const lcHeader = header.toLowerCase();
  const lcScheme = scheme.toLowerCase();
  return (request) => {
    const raw = request?.headers?.[lcHeader] ?? request?.headers?.[header];
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    if (!scheme) return value || undefined;
    const sep = value.indexOf(' ');
    if (sep === -1) return undefined;
    const sentScheme = value.slice(0, sep);
    const token = value.slice(sep + 1).trim();
    return sentScheme.toLowerCase() === lcScheme && token ? token : undefined;
  };
}

/** Build an extractor for a `?<param>=<key>` query parameter. */
export function queryExtractor(param: string): ApiKeyExtractor {
  return (request) => {
    const value = request?.query?.[param];
    return typeof value === 'string' && value ? value : undefined;
  };
}

/** Behavior — shared by `forRoot` and `forRootAsync`; all optional, all defaulted. */
export interface ApiKeyBehavior<TMeta = unknown> {
  /** Ordered extractors (first non-empty wins). Overrides the header/query defaults entirely. */
  extractors?: ApiKeyExtractor[];
  /** Header to read. Default `'Authorization'`. */
  header?: string;
  /** Auth scheme/prefix. Default `'ApiKey'`; `''` reads the raw header value. */
  scheme?: string;
  /** Also accept the key from a query param. Default `false` (query leaks to logs). */
  allowQuery?: boolean;
  /** Query param name when `allowQuery`. Default `'api_key'`. */
  queryParam?: string;
  /** Request property the key record is attached to. Default `'apiKey'`. */
  attachTo?: string;
  /** Optional: resolve the key record to a principal attached at `request.user`. */
  resolvePrincipal?: (record: ApiKeyRecord<TMeta>) => unknown | Promise<unknown>;
  /** Register the guard globally via `APP_GUARD`. Default `true`. */
  registerGuard?: boolean;
  /** Register the module globally. Default `true`. */
  isGlobal?: boolean;
}

/** The seam a host must supply. */
export interface ApiKeyProviders<TMeta = unknown> {
  store: ApiKeyStore<TMeta>;
}

/** Synchronous registration: pass the store and behavior directly. */
export interface ApiKeyOptions<TMeta = unknown>
  extends ApiKeyProviders<TMeta>,
    ApiKeyBehavior<TMeta> {}

/** Asynchronous registration: build the store from injected deps. */
export interface ApiKeyAsyncOptions<TMeta = unknown> extends ApiKeyBehavior<TMeta> {
  imports?: ModuleMetadata['imports'];
  inject?: any[];
  useFactory: (...args: any[]) => ApiKeyProviders<TMeta> | Promise<ApiKeyProviders<TMeta>>;
}

/** Fully-populated config consumed by the guard. */
export interface ResolvedApiKeyOptions<TMeta = unknown> {
  store: ApiKeyStore<TMeta>;
  extractors: ApiKeyExtractor[];
  attachTo: string;
  resolvePrincipal?: (record: ApiKeyRecord<TMeta>) => unknown | Promise<unknown>;
}

const DEFAULTS = {
  header: 'Authorization',
  scheme: 'ApiKey',
  allowQuery: false,
  queryParam: 'api_key',
  attachTo: 'apiKey'
} as const;

/** Merge behavior over the defaults; build the extractor chain when not supplied. */
export function resolveOptions<TMeta = unknown>(
  options: ApiKeyProviders<TMeta> & ApiKeyBehavior<TMeta>
): ResolvedApiKeyOptions<TMeta> {
  const scheme = options.scheme ?? DEFAULTS.scheme;
  const allowQuery = options.allowQuery ?? DEFAULTS.allowQuery;
  const extractors = options.extractors ?? [
    headerExtractor(options.header ?? DEFAULTS.header, scheme),
    ...(allowQuery ? [queryExtractor(options.queryParam ?? DEFAULTS.queryParam)] : [])
  ];
  return {
    store: options.store,
    extractors,
    attachTo: options.attachTo ?? DEFAULTS.attachTo,
    resolvePrincipal: options.resolvePrincipal
  };
}
