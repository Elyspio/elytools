# Elytools

Elytools is a cross-platform desktop utility built with Electron + React + TypeScript.

It combines media-focused tools (video encoding and torrent workflow) with desktop integrations (auto-update, system info, custom window controls, local config, and typed IPC).

## Current Features

- **Encoder**: video conversion/probing pipeline powered by ffmpeg IPC modules.
- **Torrent**:
    - search on `nyaa.si` from the app,
    - send torrents to qBittorrent through an OAuth2-protected endpoint.
- **OIDC login flow in-app**:
    - opens a dedicated BrowserWindow,
    - handles callback via app custom protocol (`elytools://...`),
    - stores refresh token encrypted with Electron Safe Storage.
- **Settings UI**:
    - full editable local app config (`version: 2`),
    - endpoint and OIDC parameters,
    - frame/appboard/window position settings.
- **Desktop app plumbing**: typed preload bridge, strict IPC contracts, logger, and updater integration.

## Tech Stack

- **Desktop runtime**: Electron 44
- **Bundling**: electron-vite on vite-plus-core (Vite 8)
- **Toolchain**: vite-plus (Oxlint, Oxfmt, Vitest)
- **Frontend**: React 19, MUI 9, Redux Toolkit, React Router 8
- **Dependency injection**: Inversify
- **Main-process modules**: TypeScript classes + IPC handlers
- **Media/system**: ffmpeg/ffprobe, systeminformation

## Project Structure

```text
src/
	main/       # Electron main process modules (window, ipc, auth, torrent, config...)
	preload/    # Typed preload API exposed to renderer
	renderer/   # React UI + Redux store + services
	shared/     # Shared types, IPC contracts, config schema
config/
	electron.vite.config.ts
```

## Getting Started

### Prerequisites

- Node.js 26+
- pnpm 12.5.1

### Install

```bash
pnpm install
```

### Run in development

```bash
pnpm dev
```

### Build app

```bash
pnpm build
```

### Build and publish a desktop release locally

```bash
pnpm release
```

This flow:

- builds Windows artifacts on the host,
- builds Linux artifacts in Docker and writes them back to `dist/`,
- publishes the collected artifacts from the host to GitHub Releases using `GITHUB_TOKEN`.

### Preview built app

```bash
pnpm start
```

## Useful Scripts

- `pnpm dev` — run Electron app in dev mode
- `pnpm build` — build app
- `pnpm start` — preview built app
- `pnpm check` — format check, lint and type check (`vp check`)
- `pnpm lint` — Oxlint, type-aware (`vp lint`)
- `pnpm fmt` — Oxfmt (`vp fmt`)
- `pnpm test` — unit tests (`vp test`)
- `pnpm typecheck` — watch mode TS checks

## Configuration

Local config is stored in the app data folder under:

- `config/config.json` (plain JSON settings)
- `config/secrets.json` (encrypted secret payloads)

Current schema is **`version: 2`** and includes:

- `windows.position`
- `appboard.show`
- `frame.show` / `frame.resize`
- `endpoints.homeAssistant`
- `endpoints.api`
- `endpoints.hubs.screenshare`
- `endpoints.qbittorrent.apiBaseUrl`
- `endpoints.oidc.{issuerUrl, clientId, scopes, redirectPath}`

## OIDC + Torrent Flow

1. User opens Settings and enters OIDC + qBittorrent endpoint settings.
2. User clicks **Login**.
3. Main process opens a modal BrowserWindow and starts OIDC Authorization Code + PKCE.
4. Provider redirects to `elytools://auth/callback`.
5. App handles callback, exchanges code for tokens, and securely stores refresh token.
6. Torrent send action calls main IPC, obtains/refreshes access token, and posts torrent to qBittorrent API.

## IPC Architecture (High Level)

- Contracts live in `src/shared/ipc/*`.
- Main handlers are registered in `src/main/ipc/ipc.handler.ts`.
- Preload exposes typed sender/receiver wrappers.
- Renderer never calls privileged Node/Electron APIs directly.

## Debugging in Production

DevTools are disabled by default in packaged builds. You can enable them explicitly:

- `ELYTOOLS_DEBUG=1` enables DevTools.
- `ELYTOOLS_DEVTOOLS_AUTOOPEN=1` auto-opens the DevTools window at startup.
- CLI switches: `--debug`, `--devtools`, `--devtools-auto-open`.

## Notes

- Legacy references in old docs/modules may still exist; this README describes the **current active flow**.
- If lint reports many errors, validate local changes with targeted diagnostics and TypeScript checks first.
