import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiKey, IS_PUBLIC_KEY, Public, REQUIRE_SCOPES_KEY, RequireScopes } from './decorators';

// NestJS stores param-decorator factories under this metadata key on the class.
const ROUTE_ARGS_METADATA = '__routeArguments__';

function getParamFactory(decorator: () => ParameterDecorator) {
  class Test {
    handler(@decorator() _arg: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Test, 'handler');
  const key = Object.keys(meta)[0];
  return meta[key].factory as (data: unknown, ctx: ExecutionContext) => unknown;
}

describe('metadata keys', () => {
  it('exposes stable metadata keys', () => {
    expect(IS_PUBLIC_KEY).toBe('nestjs-apikey-auth:public');
    expect(REQUIRE_SCOPES_KEY).toBe('nestjs-apikey-auth:scopes');
  });
});

describe('Public', () => {
  it('sets the public metadata true on a handler', () => {
    class C {
      m() {}
    }
    const decorate = Public() as MethodDecorator;
    const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'm') as PropertyDescriptor;
    decorate(C.prototype, 'm', descriptor);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, C.prototype.m)).toBe(true);
  });
});

describe('RequireScopes', () => {
  it('sets the scopes array metadata on a handler', () => {
    class C {
      m() {}
    }
    const decorate = RequireScopes('a', 'b') as MethodDecorator;
    const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'm') as PropertyDescriptor;
    decorate(C.prototype, 'm', descriptor);
    expect(Reflect.getMetadata(REQUIRE_SCOPES_KEY, C.prototype.m)).toEqual(['a', 'b']);
  });
});

describe('ApiKey param decorator', () => {
  it('returns request.apiKey', () => {
    const factory = getParamFactory(ApiKey);
    const record = { id: 'k1', ownerId: 'o1', scopes: [] };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ apiKey: record }) })
    } as unknown as ExecutionContext;
    expect(factory(undefined, ctx)).toBe(record);
  });
});
