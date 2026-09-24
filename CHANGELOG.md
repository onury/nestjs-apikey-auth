# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](http://semver.org).

## 1.0.2 (2026-09-25)

### Docs
- **Running alongside nestjs-jwt-guard.** The README said the key guard and a user-session guard run side by side; at their defaults they don't. Both guards are global and both read `Authorization`, so no request passes both. The README now shows the working setup: keep one guard global and bind the other with `registerGuard: false` and `@UseGuards()`. It also covers which of the two `@Public()` decorators to import, and which guard's `req.user` wins when both run. No code change.

## 1.0.1 (2026-09-08)

### Fixed
- Peer dependency ranges now accept NestJS 12 (`@nestjs/common`, `@nestjs/core` `^10 || ^11 || ^12`).

## 1.0.0 (2026-06-28)

- Initial release.
