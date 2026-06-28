import { Inject, Injectable } from '@nestjs/common';
import {
  type GenerateApiKeyOptions,
  generateApiKey,
  hashApiKey,
  parseDisplayPrefix
} from './apikey.util';
import type { ResolvedApiKeyOptions } from './options';
import { APIKEY_OPTIONS } from './tokens';
import type { ApiKeyRecord, IssuedApiKey } from './types';

/**
 * Thin convenience over the store for the issuance side. Optional — you can mint
 * keys yourself with the exported `generateApiKey`/`hashApiKey` helpers.
 */
@Injectable()
export class ApiKeyService<TMeta = unknown> {
  constructor(
    @Inject(APIKEY_OPTIONS)
    private readonly options: ResolvedApiKeyOptions<TMeta>
  ) {}

  /**
   * Mint a key for the given record: generate the raw key, hash it, derive the
   * display prefix, and persist via `store.save` (if implemented). Returns the
   * **raw key — show it once** — and the stored record.
   */
  async issue(
    record: ApiKeyRecord<TMeta>,
    generate: GenerateApiKeyOptions = {}
  ): Promise<{ key: string; issued: IssuedApiKey<TMeta> }> {
    const key = generateApiKey(generate);
    const issued: IssuedApiKey<TMeta> = {
      ...record,
      keyHash: hashApiKey(key),
      displayPrefix: parseDisplayPrefix(key)
    };
    await this.options.store.save?.(issued);
    return { key, issued };
  }

  /** Revoke a key by id — takes effect on the next request (auth is a lookup). */
  revoke(id: string): Promise<void> | void {
    return this.options.store.revoke(id);
  }
}
