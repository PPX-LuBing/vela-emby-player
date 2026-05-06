# Vela Player QA Checklist

Use this checklist for manual regression testing against a real Emby server after a packaged build.

## Test environment

- Build: `pnpm tauri:build`
- App bundle: `src-tauri/target/release/bundle/macos/Vela Player.app`
- Emby server URL:
- Test account:
- Test media:
  - Movie with resume progress:
  - Series with multiple seasons:
  - Episode with multiple audio tracks:
  - Episode or movie with subtitles:

## Account and secure storage

- [ ] Fresh login succeeds with server URL, username, and password.
- [ ] App restart restores the saved account without asking for credentials.
- [ ] Saved access tokens are not present in browser `localStorage` account/session keys.
- [ ] Existing legacy `localStorage` accounts migrate into system Keychain on first launch.
- [ ] Multiple saved accounts can be switched from Settings.
- [ ] Removing one account does not remove other saved accounts.
- [ ] Clearing local accounts removes saved Keychain credentials and returns to the login screen.
- [ ] Logging in again after clearing local accounts works.

## Library and home browsing

- [ ] Home loads favorite, resume, and latest sections.
- [ ] Library list loads movie and series libraries.
- [ ] Selecting a library loads items.
- [ ] Sorting by name, date added, premiere date, and rating updates the item list.
- [ ] Ascending and descending sort orders both work.
- [ ] Loading more items appends results without replacing the current list unexpectedly.
- [ ] Filters for all, favorite, unwatched, and resume produce expected visible items.

## Search

- [ ] Search waits until at least two characters are entered.
- [ ] Search results include movies, series, and episodes when available.
- [ ] Search result count displays expected loaded/total state.
- [ ] Loading more search results appends additional matches.
- [ ] Clearing the search returns to the regular library/home view.

## Media details and user data

- [ ] Movie detail opens from library/home/search.
- [ ] Series detail shows seasons and episodes.
- [ ] Episode list can be filtered to unwatched episodes.
- [ ] Play next episode picks the first unwatched episode.
- [ ] Favorite and unfavorite update the current item and lists after refresh.
- [ ] Mark watched and mark unwatched update item badges and progress state.

## Playback

- [ ] Starting playback opens the player and reports playback start to Emby.
- [ ] Resume starts near the saved Emby playback position.
- [ ] Completed items near the end restart from the beginning.
- [ ] Play/pause, seek, volume, fullscreen, and stop controls work.
- [ ] Keyboard shortcuts work: space/K, J/left, L/right, up/down, F, bracket episode navigation.
- [ ] Playback progress is reported while playing.
- [ ] Leaving the player reports stopped playback.
- [ ] Returning from player refreshes home and current library progress.
- [ ] Auto-play next episode starts near the end of an episode.

## Audio, subtitles, and transcode settings

- [ ] Player settings list available media sources.
- [ ] Player settings list available audio tracks.
- [ ] Player settings list available subtitle tracks plus the off option.
- [ ] Applying a new audio track restarts playback near the current position.
- [ ] Applying a subtitle track displays subtitles when the source supports it.
- [ ] Applying subtitle off disables subtitles.
- [ ] Force transcode changes the generated playback URL to a transcoded stream.
- [ ] Default audio language preference auto-selects a matching track on playback start.
- [ ] Default subtitle language preference auto-selects a matching subtitle on playback start.
- [ ] Empty default subtitle language keeps subtitles off by default.
- [ ] Default force transcode preference is applied when opening the player.

## Playback request user agent

- [ ] Custom playback User-Agent can be saved in Settings.
- [ ] Restoring the default User-Agent works.
- [ ] mpv/libmpv playback requests use the configured User-Agent.
- [ ] Regular WebView API requests continue working after changing playback User-Agent.

## Error recovery

- [ ] Invalid server URL or credentials show a clear login error.
- [ ] Expired/invalid token is recoverable by removing or clearing the account and logging in again.
- [ ] Missing or unloadable libmpv shows a clear playback engine message.
- [ ] Media that cannot direct play can still be attempted with force transcode.
- [ ] Keychain read/write failures surface as visible Settings/login errors.

## Packaging smoke test

- [ ] `pnpm build` exits successfully.
- [ ] `pnpm tauri:build` exits successfully.
- [ ] Packaged `Vela Player.app` launches.
- [ ] Ad-hoc codesign verification passes on the generated app bundle.
