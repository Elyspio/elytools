# Elytools

**Media tools, development workspace cleanup, and remote machine access in one desktop application.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](desktop/LICENSE.md)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-555)](desktop/config/electron-builder.yml)
[![Node.js](https://img.shields.io/badge/Node.js-26%2B-68a063)](desktop/package.json)

[Getting started](#getting-started) · [Desktop documentation](desktop/readme.md) · [Purge guide](desktop/src/renderer/src/view/components/internal/purge/README.md)

Elytools brings video encoding, torrent search, project cleanup, SSH sessions, and Home Assistant access into a shared Electron interface. It is built with React and TypeScript, with Windows and Linux release targets.

## Features

| Tool               | Capabilities                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Encoder**        | Inspect media with FFprobe and convert video with FFmpeg.                                                         |
| **Torrent**        | Search nyaa.si, detect existing torrents, and send downloads to a qBittorrent endpoint using OIDC authentication. |
| **Purge**          | Scan for dependency folders and build caches, estimate their size, and remove selected categories of artifacts.   |
| **SSH**            | Organize remote machines and work with files and commands over SSH.                                               |
| **Home Assistant** | Open a configured Home Assistant instance inside the application.                                                 |

The application also includes named OIDC profiles, encrypted credential storage, resource monitoring, update controls, and background LLM usage reporting to a configured monitor.

## Getting started

### Requirements

- **Node.js 26 or later** and **pnpm 12.5.1** for development.
- **FFmpeg and FFprobe** available on `PATH` to use the Encoder.
- Access to the external services you want to integrate, such as Home Assistant, SSH hosts, or an OIDC-protected qBittorrent endpoint.

### Run locally

From the repository root:

```bash
cd desktop
pnpm install
pnpm dev
```

Open **Settings** to configure service endpoints and authentication profiles. Some defaults reference the maintainer's private infrastructure; replace them with your own values before using those integrations.

See the [desktop guide](desktop/readme.md) for configuration, development commands, packaging, and release publishing.

## Repository layout

```text
desktop/
├── config/        # Electron bundling and packaging configuration
├── deploy/        # Linux release container definition
├── scripts/       # Build, cleanup, and publishing scripts
├── src/
│   ├── main/      # Electron services and IPC handlers
│   ├── preload/   # Typed bridge between Electron and the UI
│   ├── renderer/  # React interface, state, and services
│   └── shared/    # Configuration models, types, and IPC contracts
└── readme.md      # Desktop development and operations guide
```

## Documentation

| Guide                                                                           | Contents                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Desktop application](desktop/readme.md)                                        | Setup, architecture, configuration, authentication, and releases.   |
| [Purge tool](desktop/src/renderer/src/view/components/internal/purge/README.md) | Cleanup presets, scanning behavior, usage, and manual verification. |

## License

Elytools is distributed under the [MIT License](desktop/LICENSE.md).
