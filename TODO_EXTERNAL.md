# External Follow-up Tasks

These tasks require external services, credentials, devices, or accounts. Keep them here until the required access is available.

## Real Emby regression pass

Requires:

- A reachable Emby server URL.
- A test account with permission to browse and play media.
- Test media covering movies, series, multiple audio tracks, subtitles, resumable playback, and transcoding.
- The packaged app from `src-tauri/target/release/bundle/macos/Vela Player.app`.

Steps:

1. Build the app with `pnpm tauri:build`.
2. Launch the packaged app, not only the Vite preview.
3. Follow every item in [QA.md](QA.md).
4. Record failures with:
   - Emby server version.
   - Media type and codec.
   - Selected audio/subtitle/quality settings.
   - Screenshot or exact error message.
   - Whether forcing transcode changes the result.

## Apple release pipeline

Requires:

- Apple Developer Program membership.
- Developer ID Application certificate installed in Keychain.
- Apple Team ID.
- `notarytool` credentials or app-specific password.
- Release artifact signing/notarization policy.

Steps:

1. Configure the Tauri bundle signing identity for Developer ID distribution.
2. Replace ad-hoc signing in `scripts/sign-macos-app.mjs` with Developer ID signing for release builds.
3. Notarize the app bundle or DMG using `xcrun notarytool`.
4. Staple the notarization ticket.
5. Add a DMG target and verify install/launch on a clean macOS user account.
6. If auto-update is needed, configure Tauri updater keys, update manifest hosting, and release channel policy.
