import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const appPath = resolve(
  root,
  process.argv[2] ?? 'src-tauri/target/release/bundle/macos/Vela Player.app',
)

if (!existsSync(appPath)) {
  throw new Error(`Missing app bundle: ${appPath}`)
}

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' })
