# Elytools Desktop

**Development and operations guide for the Elytools desktop application.**

[Project overview](../README.md) · [Configuration](#configuration) · [Release workflow](#release-workflow) · [Purge guide](src/renderer/src/view/components/internal/purge/README.md)

The desktop application combines media encoding, torrent search, workspace cleanup, SSH access, and Home Assistant integration. Electron services handle system operations through a typed preload bridge, while React provides the interface.

## Getting started

### Prerequisites

| Dependency                   | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| Node.js 26+                  | Development runtime, as declared in `package.json`.   |
| pnpm 12.18.0                 | Package manager pinned by the project.                |
| FFmpeg and FFprobe on `PATH` | Video conversion and media inspection in the Encoder. |
| Podman or Docker             | Linux release packaging in a container.               |

All commands in this guide run from the `desktop/` directory.

```bash
pnpm install
pnpm dev
```

Configure your service endpoints and authentication profiles in **Settings**. Some default endpoints reference private infrastructure and must be adjusted for your environment.

## Development commands

| Command              | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `pnpm dev`           | Start Electron in development mode with rebuild watching.     |
| `pnpm build`         | Clear `out/` and `dist/`, then build the application bundles. |
| `pnpm start`         | Preview the built application.                                |
| `pnpm check`         | Run the Vite+ checks with automatic fixes (`vp check --fix`). |
| `pnpm exec vp check` | Run checks without automatic fixes.                           |
| `pnpm exec vp lint`  | Run the configured linter directly.                           |
| `pnpm exec vp fmt`   | Format files with the configured formatter.                   |
| `pnpm test`          | Run the configured test runner.                               |
| `pnpm typecheck`     | Start TypeScript checks in watch mode.                        |

## Architecture

| Layer                 | Responsibility                                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| Electron main process | Windows, files, processes, authentication, SSH, updates, and system integration. |
| Preload bridge        | Typed request and event wrappers exposed to the renderer.                        |
| React renderer        | Views, Redux state, routing, and application services.                           |
| Shared contracts      | IPC events, configuration schemas, and cross-process types.                      |

The application uses Electron, React, TypeScript, MUI, Redux Toolkit, React Router, and Inversify. Application builds use electron-vite; linting, formatting, and tests are configured through Vite+. Dependency versions are maintained in [package.json](package.json).

```text
config/
├── electron.vite.config.ts    # Application build configuration
└── electron-builder.yml      # Installers and update publishing
deploy/release/               # Linux builder container
scripts/
├── clean/                    # Build output cleanup
└── release/                  # Packages and GitHub releases (stable and development builds)
src/
├── main/                     # Electron entry point, modules, and IPC
├── preload/                  # Renderer-facing Electron bridge
├── renderer/                 # React application
└── shared/                   # Types, configuration, and IPC contracts
vite.config.ts                # Lint, format, and test configuration
```

IPC contracts live in [src/shared/ipc](src/shared/ipc), with main-process handlers registered in [ipc.handler.ts](src/main/ipc/ipc.handler.ts). Renderer services use the preload bridge to request privileged operations.

## Configuration

### Storage

The application stores settings and secrets beneath its application directory:

| File                  | Contents                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| `config/config.json`  | Versioned application settings.                                                   |
| `config/secrets.json` | OIDC refresh tokens and SSH credentials encrypted through Electron `safeStorage`. |

The application directory is resolved in this order, with `elytools` appended to the selected base path:

1. `REPERTOIREMONSISRA`, when set.
2. `LOCALAPPDATA`, when set; typically `%LOCALAPPDATA%\elytools` on Windows.
3. `$HOME/Library/Application Support`, used as the fallback on other systems, including Linux.

This resolution is implemented in [main.context.module.ts](src/main/modules/context/main.context.module.ts).

### Settings schema

The current configuration schema is **version 7**. Existing configuration versions are migrated on load. See [app.config.ts](src/shared/config/app.config.ts) for the complete model.

| Setting                                       | Purpose                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `windows.position`, `appboard.show`, `frame`  | Window placement, dashboard visibility, and frame controls.                     |
| `endpoints.homeAssistant`                     | Home Assistant instance URL.                                                    |
| `endpoints.api`, `endpoints.hubs.screenshare` | Retained backend and screen-share endpoint settings.                            |
| `endpoints.qbittorrent`                       | qBittorrent API base URL and assigned authentication profile.                   |
| `auth.profiles`, `auth.redirectPath`          | Named OIDC providers and the shared callback path.                              |
| `ssh.machines`, `ssh.folders`                 | Saved machine definitions and their organization.                               |
| `llmUsage`                                    | Usage reporting toggle, monitor URL, machine label, and authentication profile. |
| `updates`                                     | Automatic update checks and the release channel (`stable` or `dev`).            |

### Authentication and torrent workflow

1. Add an OIDC profile in **Settings** with an issuer URL, client ID, and scopes.
2. Configure the qBittorrent API base URL and assign its authentication profile.
3. Sign in to that profile. The main process opens an authentication window and uses Authorization Code with PKCE.
4. The provider redirects to `elytools://auth/callback` by default, based on `auth.redirectPath`.
5. Elytools stores the profile's refresh token through `safeStorage` and refreshes access tokens when needed.
6. Sending a torrent checks for an existing hash and uploads the torrent file to the configured API using a bearer token.

The qBittorrent integration expects an endpoint that accepts the OIDC bearer token. Each OIDC profile has its own session and can also be assigned to the LLM usage reporting integration.

## Release workflow

Releases are built on Windows with Docker or Podman running and an authenticated `gh` (`gh auth login`). The Windows installer is built on the host, the AppImage and Debian packages in the container of [deploy/release](deploy/release), both in parallel. See [release.ts](scripts/release/release.ts).

| Command              | Purpose                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm release`       | Publishes the version of `package.json` (`x.y.z`) from an up to date `main`: checks and tests, builds, pushes the tag `vx.y.z`, creates the release with notes generated from the merged PRs. |
| `pnpm release:dev`   | Publishes a development build `x.y.z-dev.n` from any clean, pushed branch, as a GitHub prerelease. `package.json` is unchanged; every development build is kept.                              |
| `pnpm package`       | Builds both platforms into `dist/` without publishing.                                                                                                                                        |
| `pnpm package:linux` | Builds the Linux packages only.                                                                                                                                                               |

### Auto update

The application follows the GitHub releases (electron-updater with a release provider reading the releases feed). In **Settings › Updates**:

- **Channel**: `Stable` follows the releases, `Dev` also the development builds; the highest version wins.
- **Automatic updates**: checks at startup then every hour, downloads a newer release and installs it on restart or when the application quits.
- Switching from `Dev` back to `Stable` offers the older stable release; it is only downloaded and installed on request.

## Runtime and debugging

Closing the main window hides it in the system tray so background jobs can continue. Use the tray menu to quit. The `--hidden` switch starts the application without showing the main window.

DevTools are disabled by default in packaged builds:

| Option                                                   | Effect                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `ELYTOOLS_DEBUG=1`, `--debug`, or `--devtools`           | Enable DevTools.                                         |
| `ELYTOOLS_DEVTOOLS_AUTOOPEN=1` or `--devtools-auto-open` | Open DevTools at startup when debugging is also enabled. |

For example, launch the Windows executable with both switches to enable and open DevTools:

```powershell
.\Elytools.exe --debug --devtools-auto-open
```

## License

See the [MIT License](LICENSE.md).
