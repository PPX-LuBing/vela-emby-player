# Vela Emby Player

Vela Emby Player is a Tauri desktop client for Emby. It provides a native desktop shell, Vue-based media browsing, account management, and mpv-backed playback.

## Features

- Connect to an Emby server with saved account profiles.
- Browse libraries, media details, seasons, and episodes.
- Play media through the bundled mpv integration.
- Report playback start, progress, and stop events back to Emby.
- Configure and switch saved Emby accounts from the settings view.

## Tech Stack

- Tauri 2
- Vue 3 with `<script setup>`
- Vuetify 3
- TypeScript
- mpv / libmpv
- pnpm

## Requirements

- Node.js
- pnpm 10
- Rust toolchain compatible with Tauri 2
- Platform dependencies required by Tauri

The bundled `tauri:dev` and `tauri:build` scripts use the Rust toolchain and network proxy settings from your shell environment. Set variables such as `RUSTC`, `CARGO_HOME`, `HTTP_PROXY`, or `HTTPS_PROXY` before running the scripts if your local machine needs custom values.

## Development

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development mode:

```bash
pnpm tauri:dev
```

Run the Vite web preview only:

```bash
pnpm dev
```

## Build

Build the frontend:

```bash
pnpm build
```

Build the Tauri app:

```bash
pnpm tauri:build
```

The macOS build script runs `scripts/sign-macos-app.mjs` after the Tauri build.

If crates.io access requires a proxy, export it in your shell before building:

```bash
export HTTP_PROXY=http://127.0.0.1:10808
export HTTPS_PROXY=http://127.0.0.1:10808
pnpm tauri:build
```

## QA

Use [QA.md](QA.md) for the manual regression checklist against a real Emby server and the packaged macOS app.

## Project Structure

- `src/` - Vue application source.
- `src/components/` - UI views and panels.
- `src/composables/useEmbyClient.ts` - Emby API client and session state.
- `src-tauri/` - Tauri application, Rust code, bundle configuration, and native resources.
- `scripts/` - Build and signing utilities.

## License

MIT
