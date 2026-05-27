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
  - Music album with multiple tracks:
  - Live TV channel:

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
- [ ] Home loads a next-up episode section for series with available next episodes.
- [ ] Home loads a recently played section after playback history exists.
- [ ] Playback History view lists continue-watching and recently played items beyond the home shelves.
- [ ] Playback History type filters narrow records to movies, episodes, or music.
- [ ] Clearing progress from Playback History removes the item from continue-watching/recently-played after refresh.
- [ ] Home loads Live TV channels when available.
- [ ] Live TV view shows current and upcoming guide programs for channels when EPG data exists.
- [ ] Live TV view shows the EPG timeline grid and selecting a channel/program opens that channel detail.
- [ ] Library list loads movie and series libraries.
- [ ] Collections and playlists appear when the server exposes them.
- [ ] Selecting a library loads items.
- [ ] Sorting by name, date added, premiere date, and rating updates the item list.
- [ ] Ascending and descending sort orders both work.
- [ ] Loading more items appends results without replacing the current list unexpectedly.
- [ ] Filters for all, favorite, unwatched, and resume produce expected visible items.
- [ ] Advanced filters for media type, year, and genre narrow the loaded library items correctly.
- [ ] Resetting advanced filters restores the visible loaded library items.

## Search

- [ ] Search waits until at least two characters are entered.
- [ ] Search results include movies, series, episodes, albums, and tracks when available.
- [ ] Search result count displays expected loaded/total state.
- [ ] Loading more search results appends additional matches.
- [ ] Clearing the search returns to the regular library/home view.

## Media details and user data

- [ ] Movie detail opens from library/home/search.
- [ ] Series detail shows seasons and episodes.
- [ ] Music album detail shows tracks and can start playback from the first/resumable track.
- [ ] Music artist detail shows tracks and can start playback from the first/resumable track.
- [ ] Collection and playlist detail pages show child items and can start playback from the first playable item.
- [ ] Movie and series detail pages show directors, writers, cast, and studios when metadata exists.
- [ ] Selecting a person from the detail page returns to the library view and runs a standard search for that name.
- [ ] Detail pages show premiere date, official rating, media source, video, audio, and subtitle metadata when available.
- [ ] Movie, series, and music detail pages show similar recommendations when the server returns them.
- [ ] Selecting a similar recommendation opens that item's detail page.
- [ ] Live TV channel detail opens and starts channel playback.
- [ ] Live TV current program name is visible on channel cards when available.
- [ ] Episode list can be filtered to unwatched episodes.
- [ ] Play next episode picks the first unwatched episode.
- [ ] Favorite and unfavorite update the current item and lists after refresh.
- [ ] Mark watched and mark unwatched update item badges and progress state.

## Playback

- [ ] Starting playback opens the player and reports playback start to Emby.
- [ ] Resume starts near the saved Emby playback position.
- [ ] Completed items near the end restart from the beginning.
- [ ] Play/pause, seek, volume, fullscreen, and stop controls work.
- [ ] Detail pages can add a movie, episode, album tracks, or channel to the playback queue.
- [ ] Player queue panel can switch queued items, remove inactive items, and clear the queue.
- [ ] Queue next/previous buttons and bracket shortcuts follow the manual queue before falling back to episode/track order.
- [ ] Playback queue and playback mode restore after app restart for the same account.
- [ ] Switching accounts restores the target account queue without leaking the previous account queue.
- [ ] Playback mode button cycles through sequential, list repeat, repeat one, and shuffle modes.
- [ ] Keyboard shortcut M cycles playback mode while the player has focus.
- [ ] Keyboard shortcuts work: space/K, J/left, L/right, up/down, F, bracket episode navigation.
- [ ] Player chapter panel lists Emby chapters and selecting a chapter seeks to that timestamp.
- [ ] Intro/outro chapter markers show a skip button and seek to the end of that chapter.
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
- [ ] Playback failure alert offers retry and force-transcode retry when applicable.
- [ ] Keychain read/write failures surface as visible Settings/login errors.

## Packaging smoke test

- [ ] `pnpm build` exits successfully.
- [ ] `pnpm tauri:build` exits successfully.
- [ ] Packaged `Vela Player.app` launches.
- [ ] Ad-hoc codesign verification passes on the generated app bundle.
