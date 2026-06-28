import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashApiKey, isExpired, scopeSatisfies } from './apikey.util';
import { IS_PUBLIC_KEY, REQUIRE_SCOPES_KEY } from './decorators';
import type { ResolvedApiKeyOptions } from './options';
import { APIKEY_OPTIONS } from './tokens';
import type { ApiKeyRecord } from './types';

/**
 * Default-deny API-key guard. One pass: extract the key (sources in order, first
 * non-empty wins) → look it up by hash (a store read every request — the price of
 * instant revocation) → attach the record → enforce `@RequireScopes`. A bad/missing
 * key is `401`; a valid key lacking a required scope is `403`. `@Public()` bypasses.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APIKEY_OPTIONS) private readonly options: ResolvedApiKeyOptions
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const rawKey = this.extract(request);
    if (!rawKey) throw new UnauthorizedException();

    const record = await this.options.store.findByHash(hashApiKey(rawKey));
    if (!record) throw new UnauthorizedException();
    if (record.expiryDate && isExpired(record.expiryDate)) {
      throw new UnauthorizedException();
    }

    request[this.options.attachTo] = record;
    if (this.options.resolvePrincipal) {
      request.user = await this.options.resolvePrincipal(record);
    }
    this.touch(record);

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_SCOPES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (required && !scopeSatisfies(required, record.scopes)) {
      throw new ForbiddenException();
    }
    return true;
  }

  private extract(request: any): string | undefined {
    for (const extractor of this.options.extractors) {
      const key = extractor(request);
      if (key) return key;
    }
    return undefined;
  }

  /** Fire-and-forget last-used tracking — never blocks the request or fails it. */
  private touch(record: ApiKeyRecord): void {
    const touch = this.options.store.touch;
    if (!touch) return;
    Promise.resolve()
      .then(() => touch(record.id, new Date()))
      .catch(() => {});
  }
}
