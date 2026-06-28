import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isExpired,
  parseDisplayPrefix,
  scopeSatisfies
} from './apikey.util';

describe('generateApiKey', () => {
  it('defaults to 32 bytes → a 43-char URL-safe base64url body', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(43);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('prepends "<prefix>_" when a prefix is given', () => {
    const key = generateApiKey({ prefix: 'sk_live' });
    expect(key).toMatch(/^sk_live_[A-Za-z0-9_-]{43}$/);
    expect(key.slice(0, 8)).toBe('sk_live_');
  });

  it('returns just the body (no leading underscore) when no prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith('_')).toBe(false);
    // The body alone has no underscore separator at position 0.
    expect(key[0]).not.toBe('_');
  });

  it('honors a custom byte length', () => {
    // 16 bytes → ceil(16 / 3) * 4 = 24, minus base64url padding = 22.
    expect(generateApiKey({ bytes: 16 })).toHaveLength(22);
    // 48 bytes → 64 base64 chars with no padding.
    expect(generateApiKey({ bytes: 48 })).toHaveLength(64);
  });

  it('produces a different key on each call', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe('hashApiKey', () => {
  it('returns a 64-char lowercase hex sha256 digest', () => {
    const hash = hashApiKey('abc');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a reference sha256 hex digest', () => {
    const expected = createHash('sha256').update('hello').digest('hex');
    expect(hashApiKey('hello')).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    expect(hashApiKey('same')).toBe(hashApiKey('same'));
  });

  it('differs for different inputs', () => {
    expect(hashApiKey('a')).not.toBe(hashApiKey('b'));
  });
});

describe('parseDisplayPrefix', () => {
  it('defaults to the first 12 chars', () => {
    expect(parseDisplayPrefix('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijkl');
    expect(parseDisplayPrefix('abcdefghijklmnopqrstuvwxyz')).toHaveLength(12);
  });

  it('honors a custom headChars count', () => {
    expect(parseDisplayPrefix('abcdefghijklmnop', 4)).toBe('abcd');
  });

  it('returns the whole key when it is shorter than headChars', () => {
    expect(parseDisplayPrefix('abc')).toBe('abc');
    expect(parseDisplayPrefix('abc', 12)).toHaveLength(3);
  });
});

describe('isExpired', () => {
  const now = new Date('2020-06-01T00:00:00.000Z');

  it('returns true for a date in the past', () => {
    expect(isExpired(new Date(now.getTime() - 1000), now)).toBe(true);
  });

  it('returns false for a date in the future', () => {
    expect(isExpired(new Date(now.getTime() + 1000), now)).toBe(false);
  });

  it('returns true at exactly now (boundary: <= not <)', () => {
    expect(isExpired(new Date(now.getTime()), now)).toBe(true);
  });

  it('defaults now to the current time when omitted', () => {
    expect(isExpired(new Date(Date.now() - 10_000))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
  });
});

describe('scopeSatisfies', () => {
  it('returns true when nothing is required (no scope gate)', () => {
    expect(scopeSatisfies([], [])).toBe(true);
    expect(scopeSatisfies([], ['billing:read'])).toBe(true);
  });

  it('short-circuits on empty required WITHOUT inspecting granted', () => {
    // Pins the `required.length === 0` early return: when required is empty the
    // granted set must never be consulted (otherwise the check is redundant).
    const granted = ['x'];
    const includes = vi.spyOn(granted, 'includes');
    expect(scopeSatisfies([], granted)).toBe(true);
    expect(includes).not.toHaveBeenCalled();
  });

  it('returns true when "*" is granted, even with non-empty required', () => {
    expect(scopeSatisfies(['billing:read', 'accounts:write'], ['*'])).toBe(true);
  });

  it('matches an exact granted scope', () => {
    expect(scopeSatisfies(['billing:read'], ['billing:read'])).toBe(true);
  });

  it('requires ALL required scopes (AND); one missing ⇒ false', () => {
    expect(
      scopeSatisfies(['billing:read', 'accounts:read'], ['billing:read', 'accounts:read'])
    ).toBe(true);
    expect(scopeSatisfies(['billing:read', 'accounts:read'], ['billing:read'])).toBe(false);
  });

  it('treats a trailing ":*" as a prefix wildcard', () => {
    expect(scopeSatisfies(['billing:read'], ['billing:*'])).toBe(true);
    expect(scopeSatisfies(['billing:read', 'billing:write'], ['billing:*'])).toBe(true);
  });

  it('does not let a "<x>:*" wildcard satisfy a different prefix', () => {
    expect(scopeSatisfies(['accounts:read'], ['billing:*'])).toBe(false);
  });

  it('does not treat a granted scope without ":*" as a wildcard', () => {
    expect(scopeSatisfies(['billing:read'], ['billing'])).toBe(false);
    expect(scopeSatisfies(['billing'], ['billing'])).toBe(true);
  });

  it('is case-sensitive', () => {
    expect(scopeSatisfies(['billing:read'], ['Billing:read'])).toBe(false);
    expect(scopeSatisfies(['billing:read'], ['billing:*'])).toBe(true);
  });

  it('keeps the ":" in the derived wildcard prefix (slice removes only the "*")', () => {
    // If the slice were wrong, "billing:" would not be the prefix and
    // "billingX" would wrongly match. Pin that it does NOT.
    expect(scopeSatisfies(['billingX'], ['billing:*'])).toBe(false);
  });
});
