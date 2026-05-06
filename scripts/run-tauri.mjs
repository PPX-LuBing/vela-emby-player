import { spawnSync } from 'node:child_process'

const command = process.argv[2]
const allowedCommands = new Set(['dev', 'build'])

if (!allowedCommands.has(command)) {
  throw new Error('Usage: node scripts/run-tauri.mjs <dev|build>')
}

const tauri = process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
const result = spawnSync(tauri, [command], {
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
