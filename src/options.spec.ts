import { describe, expect, it, vi } from 'vitest';
import { type ApiKeyExtractor, headerExtractor, queryExtractor, resolveOptions } from './options';
import type { ApiKeyRecord, ApiKeyStore } from './types';

const store = {} as ApiKeyStore;
const base = { store };

describe('resolveOptions', () => {
  it('applies every default when behavior is omitted', () => {
    const r = resolveOptions(base);
    expect(r.store).toBe(store);
    expect(r.attachTo).toBe('apiKey');
    expect(r.resolvePrincipal).toBeUndefined();
    // allowQuery defaults false ⇒ exactly one (header) extractor.
    expect(r.extractors).toHaveLength(1);
    // The single extractor reads the default header with the default scheme.
    expect(r.extractors[0]({ headers: { authorization: 'ApiKey abc' } })).toBe('abc');
  });

  it('builds two extractors when allowQuery is true', () => {
    const r = resolveOptions({ ...base, allowQuery: true });
    expect(r.extractors).toHaveLength(2);
    // The second extractor reads the default query param.
    expect(r.extractors[1]({ query: { api_key: 'qk' } })).toBe('qk');
  });

  it('preserves scheme: "" (?? not ||) so the raw header value is read', () => {
    const r = resolveOptions({ ...base, scheme: '' });
    // With scheme '' the header value is taken raw (no scheme prefix expected).
    expect(r.extractors[0]({ headers: { authorization: 'rawvalue' } })).toBe('rawvalue');
  });

  it('passes a custom extractors array through verbatim (overriding header/query)', () => {
    const custom: ApiKeyExtractor[] = [vi.fn(), vi.fn()];
    const r = resolveOptions({ ...base, extractors: custom, allowQuery: true });
    expect(r.extractors).toBe(custom);
  });

  it('honors a custom header', () => {
    const r = resolveOptions({ ...base, header: 'X-Api-Key', scheme: '' });
    expect(r.extractors[0]({ headers: { 'x-api-key': 'h' } })).toBe('h');
    // The default header is no longer consulted.
    expect(r.extractors[0]({ headers: { authorization: 'h' } })).toBeUndefined();
  });

  it('honors a custom queryParam', () => {
    const r = resolveOptions({ ...base, allowQuery: true, queryParam: 'token' });
    expect(r.extractors[1]({ query: { token: 't' } })).toBe('t');
    expect(r.extractors[1]({ query: { api_key: 't' } })).toBeUndefined();
  });

  it('honors a custom attachTo', () => {
    expect(resolveOptions({ ...base, attachTo: 'principal' }).attachTo).toBe('principal');
  });

  it('passes resolvePrincipal through', () => {
    const resolvePrincipal = (r: ApiKeyRecord) => r.ownerId;
    expect(resolveOptions({ ...base, resolvePrincipal }).resolvePrincipal).toBe(resolvePrincipal);
  });
});

describe('headerExtractor', () => {
  it('reads the lowercased header key', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'ApiKey k1' } })).toBe('k1');
  });

  it('falls back to the original-case header key', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { Authorization: 'ApiKey k2' } })).toBe('k2');
  });

  it('matches the scheme case-insensitively', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'apikey k3' } })).toBe('k3');
  });

  it('returns the raw trimmed value when scheme is "" (empty ⇒ undefined)', () => {
    const extract = headerExtractor('X-Api-Key', '');
    expect(extract({ headers: { 'x-api-key': '  raw  ' } })).toBe('raw');
    expect(extract({ headers: { 'x-api-key': '   ' } })).toBeUndefined();
  });

  it('returns undefined for a non-string header', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: ['ApiKey k'] } })).toBeUndefined();
    expect(extract({ headers: {} })).toBeUndefined();
    expect(extract({})).toBeUndefined();
    expect(extract(undefined)).toBeUndefined();
  });

  it('returns undefined when the header has no space separator', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'ApiKey' } })).toBeUndefined();
    // No space (indexOf ' ' === -1) ⇒ undefined, even when a fall-through slice
    // would coincidentally match the scheme ('ApiKeyZ'.slice(0,-1) === 'ApiKey').
    // Pins both the `sep === -1` guard and the `-1` literal.
    expect(extract({ headers: { authorization: 'ApiKeyZ' } })).toBeUndefined();
  });

  it('returns undefined for the wrong scheme', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'Bearer k' } })).toBeUndefined();
  });

  it('trims the token', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'ApiKey   k4   ' } })).toBe('k4');
  });

  it('returns undefined when the token after the scheme is empty', () => {
    const extract = headerExtractor('Authorization', 'ApiKey');
    expect(extract({ headers: { authorization: 'ApiKey   ' } })).toBeUndefined();
  });
});

describe('queryExtractor', () => {
  it('returns the string value', () => {
    const extract = queryExtractor('api_key');
    expect(extract({ query: { api_key: 'v' } })).toBe('v');
  });

  it('returns undefined for non-string, empty, or missing values', () => {
    const extract = queryExtractor('api_key');
    expect(extract({ query: { api_key: 123 } })).toBeUndefined();
    expect(extract({ query: { api_key: '' } })).toBeUndefined();
    expect(extract({ query: {} })).toBeUndefined();
    expect(extract({})).toBeUndefined();
    expect(extract(undefined)).toBeUndefined();
  });
});
