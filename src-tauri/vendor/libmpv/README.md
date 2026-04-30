# Bundled libmpv

Place libmpv runtime libraries here to enable the embedded libmpv playback engine.

Expected layout:

```text
src-tauri/vendor/libmpv/
  macos/
    libmpv.dylib
    libmpv.2.dylib
    lib/
      *.dylib
    include/mpv/
      client.h
      render.h
      render_gl.h
      stream_cb.h
  windows/
    mpv-2.dll
  linux/
    libmpv.so.2
```

Runtime order:

1. Bundled resource: `vendor/libmpv/<platform>/...`
2. Development path: `src-tauri/vendor/libmpv/<platform>/...`
3. System/Homebrew lookup paths.
4. Dynamic loader fallback such as `libmpv.dylib`.

On macOS, run this from the repository root to refresh the bundled runtime:

```sh
node scripts/vendor-libmpv-macos.mjs
```

The script downloads the Homebrew bottle for `mpv`, recursively vendors linked dylibs,
rewrites Homebrew install names to relative `@loader_path` paths, and applies ad-hoc
codesigning so `libloading` can open the runtime from inside the Tauri app bundle.

The separate `vendor/mpv/macos/mpv.app` remains as a fallback sidecar when libmpv fails.
