import { describe, expect, it, vi } from 'vitest';
import { ApiKeyService } from './apikey.service';
import { hashApiKey, parseDisplayPrefix } from './apikey.util';
import type { ResolvedApiKeyOptions } from './options';
import type { ApiKeyRecord, ApiKeyStore, IssuedApiKey } from './types';

function makeService(opts: { hasSave?: boolean } = {}) {
  const save = opts.hasSave === false ? undefined : vi.fn<NonNullable<ApiKeyStore['save']>>();
  const revoke = vi.fn(async () => undefined);
  const findByHash = vi.fn(async () => null);
  const store = { save, revoke, findByHash };
  const options = { store } as unknown as ResolvedApiKeyOptions;
  const service = new ApiKeyService(options);
  return { service, store, save, revoke };
}

const record: ApiKeyRecord = { id: 'k1', ownerId: 'o1', name: 'CI', scopes: ['billing:read'] };

describe('ApiKeyService.issue', () => {
  it('mints a key, derives hash + display prefix, and spreads the record', async () => {
    const { service } = makeService();
    const { key, issued } = await service.issue(record);
    expect(typeof key).toBe('string');
    expect(issued.keyHash).toBe(hashApiKey(key));
    expect(issued.displayPrefix).toBe(parseDisplayPrefix(key));
    expect(issued.id).toBe('k1');
    expect(issued.ownerId).toBe('o1');
    expect(issued.name).toBe('CI');
    expect(issued.scopes).toEqual(['billing:read']);
  });

  it('passes generate options through (prefix lands on the raw key)', async () => {
    const { service } = makeService();
    const { key, issued } = await service.issue(record, { prefix: 'sk_live' });
    expect(key.startsWith('sk_live_')).toBe(true);
    expect(issued.displayPrefix).toBe(parseDisplayPrefix(key));
  });

  it('persists the issued key via store.save when save is defined', async () => {
    const { service, save } = makeService();
    const { issued } = await service.issue(record);
    expect(save).toHaveBeenCalledWith(issued);
    expect((save as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(issued as IssuedApiKey);
  });

  it('does not throw when store.save is undefined (optional-chaining branch)', async () => {
    const { service, store } = makeService({ hasSave: false });
    expect(store.save).toBeUndefined();
    await expect(service.issue(record)).resolves.toMatchObject({ issued: { id: 'k1' } });
  });
});

describe('ApiKeyService.revoke', () => {
  it('delegates to store.revoke(id) and returns its result', async () => {
    const { service, revoke } = makeService();
    const result = service.revoke('k1');
    expect(revoke).toHaveBeenCalledWith('k1');
    await expect(result).resolves.toBeUndefined();
    expect(result).toBe(revoke.mock.results[0].value);
  });
});
