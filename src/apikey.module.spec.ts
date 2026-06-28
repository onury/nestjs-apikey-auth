import { APP_GUARD } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyGuard } from './apikey.guard';
import { ApiKeyModule } from './apikey.module';
import { ApiKeyService } from './apikey.service';
import type { ApiKeyProviders } from './options';
import { APIKEY_OPTIONS } from './tokens';
import type { ApiKeyStore } from './types';

function providerFor(mod: { providers?: any[] }, token: unknown): any {
  return (mod.providers ?? []).find((p) => p?.provide === token);
}

const store = {} as ApiKeyStore;
const baseOptions = { store };

describe('ApiKeyModule.forRoot', () => {
  it('wires the module, resolved options, service, guard, global guard, and exports', () => {
    const mod = ApiKeyModule.forRoot(baseOptions);
    expect(mod.module).toBe(ApiKeyModule);
    expect(mod.global).toBe(true);
    expect(mod.imports).toEqual([]);
    expect(mod.providers).toContain(ApiKeyGuard);
    expect(mod.providers).toContain(ApiKeyService);
    expect(mod.exports).toEqual([ApiKeyGuard, ApiKeyService, APIKEY_OPTIONS]);

    const optionsProvider = providerFor(mod, APIKEY_OPTIONS);
    // useValue is the *resolved* options (behavior applied, extractors built).
    expect(optionsProvider.useValue.store).toBe(store);
    expect(optionsProvider.useValue.attachTo).toBe('apiKey');
    expect(Array.isArray(optionsProvider.useValue.extractors)).toBe(true);
    expect(optionsProvider.useValue.extractors.length).toBeGreaterThan(0);

    expect(providerFor(mod, APP_GUARD).useExisting).toBe(ApiKeyGuard);
  });

  it('registers the global guard when registerGuard is omitted or true', () => {
    expect(providerFor(ApiKeyModule.forRoot(baseOptions), APP_GUARD)).toBeDefined();
    expect(
      providerFor(ApiKeyModule.forRoot({ ...baseOptions, registerGuard: true }), APP_GUARD)
    ).toBeDefined();
  });

  it('omits the global guard when registerGuard is false', () => {
    expect(
      providerFor(ApiKeyModule.forRoot({ ...baseOptions, registerGuard: false }), APP_GUARD)
    ).toBeUndefined();
  });

  it('honors isGlobal: false', () => {
    expect(ApiKeyModule.forRoot({ ...baseOptions, isGlobal: false }).global).toBe(false);
  });

  it('honors isGlobal: true', () => {
    expect(ApiKeyModule.forRoot({ ...baseOptions, isGlobal: true }).global).toBe(true);
  });
});

describe('ApiKeyModule.forRootAsync', () => {
  it('defaults imports and inject to [] and resolves merged options from the factory', async () => {
    const factoryStore = {} as ApiKeyStore;
    const providers: ApiKeyProviders = { store: factoryStore };
    const useFactory = vi.fn(() => providers);
    const mod = ApiKeyModule.forRootAsync({ attachTo: 'principal', useFactory });

    expect(mod.global).toBe(true);
    expect(mod.imports).toEqual([]);
    expect(providerFor(mod, APP_GUARD).useExisting).toBe(ApiKeyGuard);
    expect(mod.exports).toEqual([ApiKeyGuard, ApiKeyService, APIKEY_OPTIONS]);

    const optionsProvider = providerFor(mod, APIKEY_OPTIONS);
    expect(optionsProvider.inject).toEqual([]);

    const resolved = await optionsProvider.useFactory();
    expect(useFactory).toHaveBeenCalledWith();
    // Merges behavior from `options` with providers from the factory result.
    expect(resolved.store).toBe(factoryStore);
    expect(resolved.attachTo).toBe('principal');
    expect(Array.isArray(resolved.extractors)).toBe(true);
  });

  it('applies the attachTo default when behavior omits it', async () => {
    const useFactory = vi.fn(() => ({ store }));
    const mod = ApiKeyModule.forRootAsync({ useFactory });
    const resolved = await providerFor(mod, APIKEY_OPTIONS).useFactory();
    expect(resolved.attachTo).toBe('apiKey');
  });

  it('passes imports and inject through and forwards injected deps to the factory', async () => {
    class Imp {}
    const DEP = Symbol('DEP');
    const useFactory = vi.fn((_dep: unknown) => ({ store }));
    const mod = ApiKeyModule.forRootAsync({ imports: [Imp], inject: [DEP], useFactory });

    expect(mod.imports).toEqual([Imp]);
    const optionsProvider = providerFor(mod, APIKEY_OPTIONS);
    expect(optionsProvider.inject).toEqual([DEP]);

    const dep = { the: 'dep' };
    await optionsProvider.useFactory(dep);
    expect(useFactory).toHaveBeenCalledWith(dep);
  });

  it('awaits an async factory result', async () => {
    const factoryStore = {} as ApiKeyStore;
    const useFactory = vi.fn(async () => ({ store: factoryStore }));
    const mod = ApiKeyModule.forRootAsync({ useFactory });
    const resolved = await providerFor(mod, APIKEY_OPTIONS).useFactory();
    expect(resolved.store).toBe(factoryStore);
  });

  it('omits the global guard when registerGuard is false', () => {
    const mod = ApiKeyModule.forRootAsync({ useFactory: () => ({ store }), registerGuard: false });
    expect(providerFor(mod, APP_GUARD)).toBeUndefined();
  });

  it('honors isGlobal: false', () => {
    const mod = ApiKeyModule.forRootAsync({ useFactory: () => ({ store }), isGlobal: false });
    expect(mod.global).toBe(false);
  });
});
