# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Elytools** — a cross-platform media toolbox with a desktop Electron app and a web stack (ASP.NET Core API + React frontend). Some features depend on private infrastructure; endpoints/credentials are configurable in settings.

## Repository Layout

- `desktop/` — Electron + React + TypeScript app (primary component)
- `web/back/` — ASP.NET Core API + SignalR (.NET 10, MongoDB, Redis)
- `web/front/` — React + Vite web client
- `web/deploy/` — Docker build/deploy assets

## Commands

### Desktop (`cd desktop`)

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev mode | `pnpm dev` |
| Build | `pnpm build` (electron-vite build) |
| Preview built app | `pnpm start` |
| Check (fmt + lint + types) | `pnpm check` (`vp check`) |
| Lint | `pnpm lint` (`vp lint`, Oxlint type-aware) |
| Format | `pnpm fmt` (`vp fmt`, Oxfmt) |
| Test | `pnpm test` (`vp test`) |
| Typecheck (watch) | `pnpm typecheck` |
| Release (Win+Linux) | `pnpm release` |

Package manager: **pnpm 12.5.1**, Node **26+**. Build/dev use electron-vite (`config/electron.vite.config.ts`), builder config at `config/electron-builder.yml`. The vite-plus toolchain (fmt/lint/test) is configured in `vite.config.ts`; `vite` is aliased to `@voidzero-dev/vite-plus-core` via the pnpm catalog.

## Architecture

### Desktop — Three-Process Electron Model

- **Main process** (`src/main/`): Node.js, modules extending `LogModule` for Winston logging, Inversify DI with `autobind: true` (`src/main/di/container.di.ts`).
- **Preload** (`src/preload/`): Exposes typed `window.preload.ipc` bridge via contextBridge.
- **Renderer** (`src/renderer/`): React 19, MUI 9, Redux Toolkit, React Router 8, Inversify for services.
- **Shared types** (`src/shared/`): IPC channel contracts, config defaults, TypeScript interfaces.

### IPC Contract

Typed channels in `src/shared/ipc/ipc.handled.events.ts` (renderer→main) and `ipc.sent.events.ts` (main→renderer). Handlers registered centrally in `src/main/ipc/ipc.handler.ts`. When adding IPC channels, define types in shared, register handler in `ipc.handler.ts`, and expose via preload.

### Desktop Module Pattern

Main-process logic lives in modules extending `LogModule`. Use constructor DI (Inversify `@injectable()`) over singletons. The `@log` / `@log.debug` decorators (`src/main/utils/logs.utils.ts`) emit enter/exit timing automatically.

### Desktop Config

Cached JSON at `%LOCALAPPDATA%/elytools/config/` (Linux: `~/.config/elytools/config/`). Defaults in `src/shared/config/app.config.ts` with migration support. Secrets use Electron Safe Storage.

### TypeScript Path Aliases (Desktop)

`@/*` → renderer src, `@main/*` → main process, `@preload/*` → preload, `@shared/*` → shared types. Also `@components/*`, `@services/*`, `@apis/*`.

## Key Conventions

- Extend DI modules instead of creating ad-hoc singletons
- Keep renderer/main shared types under `desktop/src/shared`
- FFmpeg features require `ffmpeg`/`ffprobe` on PATH (no bundled binary)
- Desktop uses TypeScript decorators (`experimentalDecorators`, `emitDecoratorMetadata`)
- Lint/format config: `defaultLintConfig` / `defaultFmtConfig` from `@elyspio/vite-eslint-config` (Oxlint + Oxfmt through vite-plus)
