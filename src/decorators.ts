import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ApiKeyRecord } from './types';

/** Metadata key set by {@link Public}; read by the guard. */
export const IS_PUBLIC_KEY = 'nestjs-apikey-auth:public';

/** Metadata key set by {@link RequireScopes}; read by the guard. */
export const REQUIRE_SCOPES_KEY = 'nestjs-apikey-auth:scopes';

/** Exempt a route (or whole controller) from the guard — no key required. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Require the authenticated key to carry **all** of these scopes (AND). Missing a
 * scope ⇒ `403`. With no `@RequireScopes`, any valid key passes (authN only).
 * Composes with `nestjs-accesscontrol`: scopes gate *which keys* may call a route;
 * access-control gates *what the principal may do*.
 */
export const RequireScopes = (...scopes: string[]) => SetMetadata(REQUIRE_SCOPES_KEY, scopes);

/**
 * Param decorator for the attached key record (`request.apiKey`). If you change
 * `attachTo`, read the request directly instead.
 */
export const ApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyRecord | undefined =>
    ctx.switchToHttp().getRequest().apiKey
);
