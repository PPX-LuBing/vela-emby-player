# Bundled mpv

Put platform mpv binaries here before building a distributable app.

Current vendored binary:

- macOS arm64: `macos/mpv.app`
- mpv version in archive name: `0.40.0`
- Source: `https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-arm64-latest.tar.gz`
- SHA-256: `3170fb709defebaba33e9755297d70dc3562220541de54fc3d494a8309ef1260`

Expected layout:

```text
src-tauri/vendor/mpv/
  macos/
    mpv.app/Contents/MacOS/mpv
    # or: mpv
  windows/
    mpv.exe
  linux/
    mpv
```

At runtime the app resolves mpv in this order:

1. Path entered in the UI.
2. Tauri bundled resource: `vendor/mpv/<platform>/...`.
3. Development path: `src-tauri/vendor/mpv/<platform>/...`.
4. System `PATH`: `mpv`.

mpv is GPL/LGPL licensed depending on its build options and linked libraries. If you redistribute mpv with this app, include the matching license notices and source/build information for the exact binary you ship.
