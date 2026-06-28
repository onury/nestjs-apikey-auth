import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyGuard } from './apikey.guard';
import { hashApiKey } from './apikey.util';
import { IS_PUBLIC_KEY, REQUIRE_SCOPES_KEY } from './decorators';
import type { ApiKeyExtractor, ResolvedApiKeyOptions } from './options';
import type { ApiKeyRecord } from './types';

class Ctrl {
  secured() {}
}

function ctx(request: unknown) {
  return {
    getHandler: () => Ctrl.prototype.secured,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => request })
  } as never;
}

type Make = {
  isPublic?: boolean;
  requiredScopes?: string[] | undefined;
  record?: ApiKeyRecord | null;
  extractors?: ApiKeyExtractor[];
  attachTo?: string;
  resolvePrincipal?: ResolvedApiKeyOptions['resolvePrincipal'];
  touch?: ((id: string, at: Date) => unknown) | undefined;
  hasTouch?: boolean;
};

function makeGuard(opts: Make = {}) {
  const reflector = {
    getAllAndOverride: vi.fn((key: unknown) =>
      key === IS_PUBLIC_KEY ? (opts.isPublic ?? false) : opts.requiredScopes
    )
  };
  const findByHash = vi.fn(async () => (opts.record === undefined ? null : opts.record));
  const revoke = vi.fn();
  const touch = opts.hasTouch === false ? undefined : vi.fn(opts.touch ?? (async () => undefined));
  const store = { findByHash, revoke, touch };
  const options = {
    store,
    extractors: opts.extractors ?? [() => 'rawkey'],
    attachTo: opts.attachTo ?? 'apiKey',
    resolvePrincipal: opts.resolvePrincipal
  } as unknown as ResolvedApiKeyOptions;
  const guard = new ApiKeyGuard(reflector as never, options);
  return { guard, reflector, store, findByHash, touch };
}

const validRecord: ApiKeyRecord = { id: 'k1', ownerId: 'o1', scopes: ['billing:read'] };

describe('ApiKeyGuard', () => {
  it('allows @Public() routes without consulting the store', async () => {
    const { guard, reflector, findByHash } = makeGuard({ isPublic: true });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      Ctrl.prototype.secured,
      Ctrl
    ]);
    expect(findByHash).not.toHaveBeenCalled();
  });

  it('rejects when no key is extracted', async () => {
    const { guard, findByHash } = makeGuard({ extractors: [() => undefined, () => null] });
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findByHash).not.toHaveBeenCalled();
  });

  it('uses the first non-empty extractor (skips the earlier undefined one)', async () => {
    const { guard, findByHash } = makeGuard({
      record: validRecord,
      extractors: [() => undefined, () => 'second-key']
    });
    const req: Record<string, unknown> = {};
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(findByHash).toHaveBeenCalledWith(hashApiKey('second-key'));
  });

  it('rejects when findByHash returns null', async () => {
    const { guard } = makeGuard({ record: null });
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a record with a past expiryDate', async () => {
    const { guard } = makeGuard({
      record: { ...validRecord, expiryDate: new Date(Date.now() - 1000) }
    });
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a record with a future expiryDate', async () => {
    const { guard } = makeGuard({
      record: { ...validRecord, expiryDate: new Date(Date.now() + 60_000) }
    });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('allows a record with no expiryDate', async () => {
    const { guard } = makeGuard({ record: { ...validRecord, expiryDate: undefined } });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('attaches the record to the configured attachTo property', async () => {
    const { guard } = makeGuard({ record: validRecord, attachTo: 'principalKey' });
    const req: Record<string, unknown> = {};
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.principalKey).toBe(validRecord);
    expect(req.apiKey).toBeUndefined();
  });

  it('sets request.user to the awaited resolvePrincipal result when configured', async () => {
    const resolvePrincipal = vi.fn(async (r: ApiKeyRecord) => ({ principal: r.ownerId }));
    const { guard } = makeGuard({ record: validRecord, resolvePrincipal });
    const req: Record<string, unknown> = {};
    await guard.canActivate(ctx(req));
    expect(resolvePrincipal).toHaveBeenCalledWith(validRecord);
    expect(req.user).toEqual({ principal: 'o1' });
  });

  it('leaves request.user untouched when resolvePrincipal is not configured', async () => {
    const { guard } = makeGuard({ record: validRecord });
    const req: Record<string, unknown> = {};
    await guard.canActivate(ctx(req));
    expect(req.user).toBeUndefined();
  });

  it('allows when @RequireScopes is present and satisfied', async () => {
    const { guard, reflector } = makeGuard({
      record: validRecord,
      requiredScopes: ['billing:read']
    });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    // The scope metadata is read off the handler + class (pins the lookup target).
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_SCOPES_KEY, [
      Ctrl.prototype.secured,
      Ctrl
    ]);
  });

  it('throws Forbidden when @RequireScopes is present and not satisfied', async () => {
    const { guard } = makeGuard({ record: validRecord, requiredScopes: ['accounts:write'] });
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows regardless of scopes when @RequireScopes is absent (reflector ⇒ undefined)', async () => {
    const { guard } = makeGuard({
      record: { ...validRecord, scopes: [] },
      requiredScopes: undefined
    });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('calls store.touch(record.id, a Date) fire-and-forget on success', async () => {
    const { guard, touch } = makeGuard({ record: validRecord });
    await guard.canActivate(ctx({}));
    await vi.waitFor(() => expect(touch).toHaveBeenCalledTimes(1));
    const [id, at] = (touch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('k1');
    expect(at).toBeInstanceOf(Date);
  });

  it('still resolves true when store.touch rejects (the .catch swallows)', async () => {
    const touch = vi.fn(async () => {
      throw new Error('boom');
    });
    const { guard } = makeGuard({ record: validRecord, touch });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    await vi.waitFor(() => expect(touch).toHaveBeenCalled());
    await Promise.resolve();
  });

  it('does not throw when store.touch is undefined', async () => {
    const { guard, store } = makeGuard({ record: validRecord, hasTouch: false });
    expect(store.touch).toBeUndefined();
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('does not even attempt a touch (no record.id read) when store.touch is undefined', async () => {
    // Pins the `if (!touch) return` early-out: with no touch the guard must NOT
    // build the fire-and-forget chain, so it never reads record.id.
    const idGet = vi.fn(() => 'k1');
    const record = {
      ownerId: 'o1',
      scopes: [],
      get id() {
        return idGet();
      }
    } as unknown as ApiKeyRecord;
    const { guard } = makeGuard({ record, hasTouch: false });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    // Drain any (mutant-scheduled) microtasks before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idGet).not.toHaveBeenCalled();
  });
});
