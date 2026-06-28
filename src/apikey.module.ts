import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './apikey.guard';
import { ApiKeyService } from './apikey.service';
import {
  type ApiKeyAsyncOptions,
  type ApiKeyBehavior,
  type ApiKeyOptions,
  resolveOptions
} from './options';
import { APIKEY_OPTIONS } from './tokens';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module idiom — forRoot/forRootAsync are conventionally static factories on the module class.
export class ApiKeyModule {
  /** Synchronous registration: pass the store and behavior directly. */
  static forRoot<TMeta = unknown>(options: ApiKeyOptions<TMeta>): DynamicModule {
    const optionsProvider: Provider = {
      provide: APIKEY_OPTIONS,
      useValue: resolveOptions(options)
    };
    return ApiKeyModule.build(options, optionsProvider, []);
  }

  /** Asynchronous registration: build the store from injected deps. */
  static forRootAsync<TMeta = unknown>(options: ApiKeyAsyncOptions<TMeta>): DynamicModule {
    const optionsProvider: Provider = {
      provide: APIKEY_OPTIONS,
      inject: options.inject ?? [],
      useFactory: async (...args: any[]) =>
        resolveOptions({ ...options, ...(await options.useFactory(...args)) })
    };
    return ApiKeyModule.build(options, optionsProvider, options.imports ?? []);
  }

  private static build<TMeta = unknown>(
    behavior: ApiKeyBehavior<TMeta>,
    optionsProvider: Provider,
    imports: NonNullable<DynamicModule['imports']>
  ): DynamicModule {
    const providers: Provider[] = [optionsProvider, ApiKeyGuard, ApiKeyService];
    if (behavior.registerGuard ?? true) {
      providers.push({ provide: APP_GUARD, useExisting: ApiKeyGuard });
    }
    return {
      module: ApiKeyModule,
      global: behavior.isGlobal ?? true,
      imports,
      providers,
      exports: [ApiKeyGuard, ApiKeyService, APIKEY_OPTIONS]
    };
  }
}
