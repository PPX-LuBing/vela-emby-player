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

The bundled `tauri:dev` and `tauri:build` scripts currently include local macOS-specific environment variables for `RUSTC`, `CARGO_HOME`, and proxy settings. Adjust those values in `package.json` if your local Rust toolchain or network setup is different.

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

## Project Structure

- `src/` - Vue application source.
- `src/components/` - UI views and panels.
- `src/composables/useEmbyClient.ts` - Emby API client and session state.
- `src-tauri/` - Tauri application, Rust code, bundle configuration, and native resources.
- `scripts/` - Build and signing utilities.

## License

MIT
