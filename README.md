# Elytools

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Node.js](https://img.shields.io/badge/Node.js-26+-68a063?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19+-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![.NET](https://img.shields.io/badge/.NET-10.0-512bd4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)

A comprehensive cross-platform toolbox for media workflows, system utilities, and home-lab automation.

## 🎯 Project Scope

Elytools is a personal suite designed to centralize and automate common workflows. It consists of a powerful desktop application and a supporting web infrastructure.

> **Note:** Several parts are wired to private infrastructure by default. You may need to adjust endpoints and credentials in the settings.

---

## 🏗️ Core Components

### 🖥️ [Desktop Application](./desktop/readme.md)
The flagship experience: a feature-rich Electron app providing deep system integration.

- **Encoder**: Video conversion/probing pipeline powered by FFmpeg.
- **Torrent**: Search on `nyaa.si` and forward to qBittorrent via OAuth2.
- **Integrations**: Home Assistant access, OIDC login flow, auto-updates.
- **Stack**: Electron, React, TypeScript, MUI, Inversify.

👉 **[View Desktop README](./desktop/readme.md)** for installation and usage.

### 🌐 Web Infrastructure
Supporting services and a web-based client for remote access.

- **Backend**: ASP.NET Core API providing weather data and SignalR screen-share hub.
- **Frontend**: React + Vite client for remote monitoring and auth flows.
- **Stack**: .NET 10, MongoDB, Redis, React.

👉 **[Jump to Web Stack Details](#-web-stack)**

---

## 📂 Repository Layout

```text
.
├── desktop/    # Electron + React + TypeScript application

```

---

## 🚀 Quick Start

To run the main desktop application:

```bash
cd desktop
pnpm install
pnpm dev
```

*For web services, refer to the [Web Stack](#-web-stack) section below.*

---

## 🔧 Desktop Configuration

The app creates local configuration files under the user app-data folder:
- **Windows**: `%LOCALAPPDATA%\elytools\config\`
- **Linux**: `~/.config/elytools/config/`

The UI exposes settings for:
- Home Assistant & Backend URLs
- Screen-share hub & qBittorrent API
- OIDC configuration (Issuer, Client ID, Scopes)
