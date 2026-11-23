import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { configPath, loadConfig } from './config.js'
import { runDoctor } from './doctor.js'
import { ensureHome, packageRoot } from './launch.js'
import { normLanguage } from './languages.js'
import { resolveSecret, storeSecret } from './secrets.js'
import { Dante } from './service.js'

interface Answers {
  languages: string[]
  engines: string[]
  debrid: string[]
}

function ask(rl: Interface, question: string, fallback = ''): Promise<string> {
  return new Promise(resolve => rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `, a => resolve(a.trim() || fallback)))
}

/** Read a secret without echoing it. */
function askSecret(rl: Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    const r = rl as Interface & { _writeToOutput?: (s: string) => void }
    const original = r._writeToOutput
    rl.question(`${question}: `, answer => {
      r._writeToOutput = original
      process.stdout.write('\n')
      resolve(answer.trim())
    })
    r._writeToOutput = (s: string) => {
      if (s.includes(question)) original?.call(rl, s)
    }
  })
}

async function yes(rl: Interface, question: string, fallback = true): Promise<boolean> {
  const a = (await ask(rl, `${question} (y/n)`, fallback ? 'y' : 'n')).toLowerCase()
  return a.startsWith('y') || a.startsWith('s')
}

/** Keep a secret: reuse what the Keychain already has, or ask and store it. */
async function secret(rl: Interface, service: string, prompt: string): Promise<boolean> {
  if (await resolveSecret(`keychain:${service}`)) {
    process.stdout.write(`  Found ${service} in the Keychain; using it.\n`)
    return true
  }
  const value = await askSecret(rl, `  ${prompt} (input hidden, Enter to skip)`)
  if (!value) return false
  await storeSecret(service, value)
  process.stdout.write(`  Stored in the Keychain as ${service}.\n`)
  return true
}

function defaultLanguage(): string {
  const lang = (process.env.LANG ?? '').slice(0, 2).toLowerCase()
  return { es: 'spa', it: 'ita', fr: 'fre', de: 'ger', pt: 'por' }[lang] ?? ''
}

export function renderConfig(a: Answers): string {
  const list = (xs: string[]) => `[${xs.map(x => `"${x}"`).join(', ')}]`
  return `# Dante's settings. Secrets are never written here: "keychain:NAME" points to the macOS
# Keychain (account "dante"); "env:VAR" reads an environment variable.

ui_language = "en"          # "en" or "es": the words in Dante's interface
animation = "full"          # full | calm (moves only while working) | off

[preferences]
resolutions = ["2160p", "1080p"]       # best first
hdr = ["DV", "HDR10+", "HDR10"]        # best first
languages = ${list(a.languages)}${' '.repeat(Math.max(1, 26 - list(a.languages).length))}# audio you want, best first (spa, lat, eng, ita, fre, ger, …)
dub_fallback = true                    # keep a better video without your language and offer to add it (audio4films)
prefer_full_disc = false               # rank full Blu-ray discs (BDMV, with menus) first
# max_size_gb = 80
avoid = ["CAM", "3D"]
${a.engines.join('\n')}
[debrid]
${a.debrid.join('\n')}

[play]
player = "auto"   # auto (IINA, then VLC, then mpv) | iina | vlc | mpv | stremio
port = 7879       # Dante's Stremio addon

[bdmv]
library = "library"   # where full-disc menus are copied, inside the Dante folder
`
}

export async function runSetup(): Promise<number> {
  const { home } = ensureHome()
  const path = configPath(home)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write(`Dante setup. Folder: ${home}\n\n`)
    const existing = existsSync(path) ? loadConfig(home) : undefined
    if (existing?.engines.length && !(await yes(rl, `${path} already has ${existing.engines.length} engine(s). Start again`, false))) {
      process.stdout.write('Keeping it. Edit dante.toml by hand any time.\n')
      return 0
    }

    const langs = (await ask(rl, 'Audio languages you want, best first (e.g. spa, lat, eng)', defaultLanguage()))
      .split(/[ ,]+/)
      .map(l => normLanguage(l) ?? l)
      .filter(Boolean)

    process.stdout.write('\nEngines: where Dante searches. Add at least one.\n')
    const engines: string[] = []
    if (await yes(rl, '1. AIOStreams (one engine for many addons and debrid services; best)', false)) {
      const url = await ask(rl, '  AIOStreams base URL (e.g. http://localhost:8080)')
      if (url && (await secret(rl, 'dante.aiostreams', 'AIOStreams "uuid:password" from its config page'))) {
        engines.push(`\n[[engines]]\nname = "aiostreams"\ntype = "aiostreams"\nurl = "${url}"\ncredentials = "keychain:dante.aiostreams"\n`)
      }
    }
    if (await yes(rl, '2. A Stremio addon (Comet, Torrentio, MediaFusion) already configured with your debrid', false)) {
      const name = (await ask(rl, '  Short name', 'comet')).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'addon'
      if (await secret(rl, `dante.${name}`, `  ${name} manifest URL (it contains your config, so it goes to the Keychain)`)) {
        engines.push(`\n[[engines]]\nname = "${name}"\ntype = "stremio"\nurl = "keychain:dante.${name}"\n`)
      }
    }
    if (await yes(rl, '3. Jackett or Prowlarr (Torznab; needed for full Blu-ray discs)', false)) {
      const url = await ask(rl, '  Torznab URL', 'http://localhost:9117/api/v2.0/indexers/all/results/torznab/api')
      if (await secret(rl, 'dante.jackett', 'Jackett/Prowlarr API key')) {
        engines.push(`\n[[engines]]\nname = "jackett"\ntype = "torznab"\nurl = "${url}"\napi_key = "keychain:dante.jackett"\n`)
      }
    }

    process.stdout.write('\nDebrid services: where Dante adds what you pick and gets direct links.\n')
    const debrid: string[] = []
    for (const [id, label] of [['alldebrid', 'AllDebrid'], ['realdebrid', 'Real-Debrid'], ['torbox', 'TorBox']] as const) {
      const have = await resolveSecret(`keychain:dante.${id}`)
      if (have || (await yes(rl, `${label}`, false))) {
        if (await secret(rl, `dante.${id}`, `${label} API key`)) debrid.push(`${id} = "keychain:dante.${id}"`)
      }
    }

    writeFileSync(path, renderConfig({ languages: langs, engines, debrid }))
    process.stdout.write(`\nWrote ${path}\n`)
    installTheme()
    process.stdout.write(`\n${await runDoctor(new Dante(loadConfig(home)))}\n\nNow run: dante\n`)
    return 0
  } finally {
    rl.close()
  }
}

/** Claude Code reads custom themes from ~/.claude/themes; Dante's settings select "custom:dante". */
export function installTheme(): void {
  const source = join(packageRoot(), 'plugin', 'themes', 'dante.json')
  if (!existsSync(source)) return
  const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'themes')
  mkdirSync(dir, { recursive: true })
  copyFileSync(source, join(dir, 'dante.json'))
}
