import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const vendorRoot = join(root, 'src-tauri/vendor/libmpv/macos')
const vendorLib = join(vendorRoot, 'lib')
const workRoot = '/tmp/emby-libmpv-vendor'
const tag = process.env.HOMEBREW_BOTTLE_TAG || 'arm64_sequoia'
const proxyEnv = {
  ...process.env,
  http_proxy: process.env.http_proxy ?? 'http://127.0.0.1:10808',
  https_proxy: process.env.https_proxy ?? 'http://127.0.0.1:10808',
  all_proxy: process.env.all_proxy ?? 'socks5://127.0.0.1:10808',
  HTTP_PROXY: process.env.HTTP_PROXY ?? 'http://127.0.0.1:10808',
  HTTPS_PROXY: process.env.HTTPS_PROXY ?? 'http://127.0.0.1:10808',
  ALL_PROXY: process.env.ALL_PROXY ?? 'socks5://127.0.0.1:10808',
}

mkdirSync(vendorRoot, { recursive: true })
mkdirSync(vendorLib, { recursive: true })
mkdirSync(workRoot, { recursive: true })

const fetched = new Map()
const copied = new Set()

await vendorFormula('mpv')
copyMpvHeaders()
await collectDependencies()
patchInstallNames()
signDylibs()

console.log(`Vendored libmpv into ${vendorRoot}`)

async function vendorFormula(name) {
  const bottle = await fetchBottle(name)
  const bottlePath = join(workRoot, `${name}.tar.gz`)
  if (!existsSync(bottlePath)) {
    curl(bottle.url, bottlePath, bottle.sha256)
  }

  const extractDir = join(workRoot, 'extract', name)
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true })
    execFileSync('tar', ['-xzf', bottlePath, '-C', extractDir], { stdio: 'inherit' })
  }
  fetched.set(name, extractDir)

  if (name === 'mpv') {
    copyFromFormula(extractDir, 'lib/libmpv.2.dylib', join(vendorRoot, 'libmpv.2.dylib'))
    copyFromFormula(extractDir, 'lib/libmpv.dylib', join(vendorRoot, 'libmpv.dylib'))
  }
}

async function collectDependencies() {
  let changed = true
  while (changed) {
    changed = false
    for (const file of allDylibs()) {
      for (const dep of linkedHomebrewDeps(file)) {
        const formula = formulaFromDep(dep)
        if (!formula) continue
        if (!fetched.has(formula)) {
          await vendorFormula(formula)
          changed = true
        }

        const depName = basename(dep)
        if (!existsSync(join(vendorLib, depName))) {
          const copiedFile = copyDylibFromFormula(fetched.get(formula), depName)
          if (copiedFile) {
            changed = true
          }
        }
      }
    }
  }
}

async function fetchBottle(name) {
  const formulaPath = join(workRoot, `${name}.json`)
  if (!existsSync(formulaPath)) {
    execFileSync('curl', [
      '-fsSL',
      `https://formulae.brew.sh/api/formula/${name}.json`,
      '-o',
      formulaPath,
    ], { env: proxyEnv, stdio: 'inherit' })
  }

  const formula = JSON.parse(readFileSync(formulaPath, 'utf8'))
  const file = formula.bottle?.stable?.files?.[tag]
  if (!file) {
    throw new Error(`No ${tag} bottle for ${name}`)
  }

  return { url: file.url, sha256: file.sha256 }
}

function curl(url, out, sha256) {
  const token = execFileSync('curl', [
    '-fsSL',
    `https://ghcr.io/token?scope=repository:${repositoryFromUrl(url)}:pull&service=ghcr.io`,
  ], { env: proxyEnv, encoding: 'utf8' })
  const parsed = JSON.parse(token)
  execFileSync('curl', [
    '-L',
    '--fail',
    '--show-error',
    '-H',
    `Authorization: Bearer ${parsed.token}`,
    '-H',
    'Accept: application/vnd.oci.image.layer.v1.tar+gzip, application/octet-stream',
    '-o',
    out,
    url,
  ], { env: proxyEnv, stdio: 'inherit' })
  const actual = execFileSync('shasum', ['-a', '256', out], { encoding: 'utf8' }).split(/\s+/)[0]
  if (actual !== sha256) {
    throw new Error(`SHA mismatch for ${url}: ${actual} !== ${sha256}`)
  }
}

function repositoryFromUrl(url) {
  const match = url.match(/ghcr\.io\/v2\/(.+)\/blobs\//)
  if (!match) throw new Error(`Unsupported bottle URL: ${url}`)
  return match[1]
}

function copyFromFormula(extractDir, relativeSuffix, destination) {
  const file = findFile(extractDir, relativeSuffix)
  if (!file) throw new Error(`Missing ${relativeSuffix} in ${extractDir}`)
  copyResolved(file, destination)
}

function copyDylibFromFormula(extractDir, dylibName) {
  const file = findByBasename(extractDir, dylibName)
  if (!file) return false
  copyResolved(file, join(vendorLib, dylibName))
  copied.add(dylibName)
  return true
}

function copyResolved(source, destination) {
  if (existsSync(destination)) return
  const realSource = execFileSync('python3', ['-c', 'import os,sys; print(os.path.realpath(sys.argv[1]))', source], { encoding: 'utf8' }).trim()
  copyFileSync(realSource, destination)
  chmodSync(destination, 0o644)
}

function findFile(dir, suffix) {
  return walk(dir).find((file) => file.endsWith(suffix))
}

function findByBasename(dir, name) {
  return walk(dir).find((file) => basename(file) === name)
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

function allDylibs() {
  return [
    join(vendorRoot, 'libmpv.2.dylib'),
    join(vendorRoot, 'libmpv.dylib'),
    ...walk(vendorLib).filter((file) => file.endsWith('.dylib')),
  ].filter((file) => existsSync(file))
}

function linkedHomebrewDeps(file) {
  const output = execFileSync('otool', ['-L', file], { encoding: 'utf8' })
  return output
    .split('\n')
    .map((line) => line.trim().split(' ')[0])
    .filter((dep) => dep.includes('@@HOMEBREW_PREFIX@@/opt/') || dep.includes('@@HOMEBREW_CELLAR@@/'))
}

function linkedDeps(file) {
  const output = execFileSync('otool', ['-L', file], { encoding: 'utf8' })
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' ')[0])
    .filter(Boolean)
}

function formulaFromDep(dep) {
  const match = dep.match(/@@HOMEBREW_(?:PREFIX@@\/opt|CELLAR@@)\/([^/]+)\//)
  return match?.[1]
}

function patchInstallNames() {
  for (const file of allDylibs()) {
    const name = basename(file)
    const isVendorLibFile = dirname(file) === vendorLib
    execFileSync('install_name_tool', ['-id', `@rpath/${name}`, file])
    for (const dep of linkedHomebrewDeps(file)) {
      const depName = basename(dep)
      const replacement = isVendorLibFile
        ? `@loader_path/${depName}`
        : `@loader_path/lib/${depName}`
      execFileSync('install_name_tool', ['-change', dep, replacement, file])
    }

    if (!isVendorLibFile) {
      for (const dep of linkedDeps(file)) {
        const depName = basename(dep)
        if (dep.startsWith('@loader_path/') && existsSync(join(vendorLib, depName))) {
          const replacement = `@loader_path/lib/${depName}`
          if (dep !== replacement) {
            execFileSync('install_name_tool', ['-change', dep, replacement, file])
          }
        }
      }
    }
  }

  copyFileSync(join(vendorRoot, 'libmpv.2.dylib'), join(vendorRoot, 'libmpv.dylib'))
  execFileSync('install_name_tool', ['-id', '@rpath/libmpv.dylib', join(vendorRoot, 'libmpv.dylib')])
}

function signDylibs() {
  for (const file of allDylibs()) {
    chmodSync(file, 0o644)
    execFileSync('codesign', ['--force', '--sign', '-', file])
  }
}

function copyMpvHeaders() {
  const mpvExtract = fetched.get('mpv')
  const includeSource = walk(mpvExtract).find((file) => file.endsWith('/include/mpv/client.h'))
  if (!includeSource) return
  const includeDir = dirname(includeSource)
  const outDir = join(vendorRoot, 'include/mpv')
  mkdirSync(outDir, { recursive: true })
  for (const header of ['client.h', 'render.h', 'render_gl.h', 'stream_cb.h']) {
    const source = join(includeDir, header)
    if (existsSync(source)) copyFileSync(source, join(outDir, header))
  }
}
