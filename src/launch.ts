import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configPath, danteHome, loadConfig } from './config.js'

/** The installed package: dist/ sits next to plugin/ and template/. */
export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The real Claude Code binary. Never a shell function or alias: those can run hooks or print
 * banners first. `DANTE_CLAUDE` overrides.
 */
export function findClaude(): string | undefined {
  const override = process.env.DANTE_CLAUDE
  if (override) return executable(override) ? override : undefined
  const local = join(homedir(), '.local', 'bin', 'claude')
  if (executable(local)) return local
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(dir, 'claude')
    if (dir && executable(candidate)) return candidate
  }
  return undefined
}

/** Create the Dante folder from the template the first time. Never overwrites the user's files. */
export function ensureHome(home = danteHome()): { home: string; created: boolean } {
  const created = !existsSync(home)
  mkdirSync(home, { recursive: true })
  const template = join(packageRoot(), 'template')
  // dante.toml is written by `dante setup`, never copied: its presence means setup ran.
  for (const file of ['CLAUDE.md']) {
    const target = join(home, file)
    if (!existsSync(target) && existsSync(join(template, file))) copyFileSync(join(template, file), target)
  }
  return { home, created }
}

const shellQuoted = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`

/**
 * Claude Code's settings for this session only. With a pinned header the status line's figures go up
 * there (feed.ts) and the row under the prompt stays empty. Anywhere else the header scrolls away, so
 * the person's own status line stays as it is.
 *
 * `env` goes along in them: a session sent to the background (the agents view) is another process,
 * started by a service that keeps the settings but not the environment it was opened with.
 */
export function launchSettings(isPinned: boolean, env: Record<string, string> = {}): Record<string, unknown> {
  const settings = { ...(JSON.parse(readFileSync(join(packageRoot(), 'plugin', 'settings.json'), 'utf8')) as Record<string, unknown>), ...(Object.keys(env).length === 0 ? {} : { env }) }
  if (!isPinned) return settings
  const command = [process.execPath, join(packageRoot(), 'dist', 'feed.js')].map(shellQuoted).join(' ')
  // Only the fullscreen layout has a place to pin it to.
  return { ...settings, tui: 'fullscreen', statusLine: { type: 'command', command } }
}

export function claudeArgs(extra: string[], isPinned: boolean, env: Record<string, string> = {}): string[] {
  return ['--plugin-dir', join(packageRoot(), 'plugin'), '--settings', JSON.stringify(launchSettings(isPinned, env)), ...extra]
}

/** Whether this terminal shows pictures read from a file (the kitty graphics protocol). */
export function drawsPictures(graphics: 'auto' | 'image' | 'blocks', env: NodeJS.ProcessEnv = process.env): boolean {
  if (graphics !== 'auto') return graphics === 'image'
  if (env.TMUX || env.SSH_CONNECTION) return false
  return env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty' || env.TERM === 'xterm-kitty' || Boolean(env.KITTY_WINDOW_ID)
}

/**
 * What the mod needs to know about how to draw. In the background Claude Code cannot ask the terminal
 * whether it shows pictures and takes it that it does not, so where that is known it is told.
 */
export function lookEnv(graphics: 'auto' | 'image' | 'blocks', cell: () => string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!drawsPictures(graphics, env)) return { DANTE_GRAPHICS: 'blocks' }
  const isKnown = graphics === 'image' || env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty'
  return { DANTE_GRAPHICS: 'image', DANTE_CELL: cell(), ...(isKnown ? { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' } : {}) }
}

/** Pixels of one terminal cell, as "7x18". Empty when the terminal does not say. */
function cellSize(): string {
  const asked = spawnSync(process.execPath, [join(packageRoot(), 'dist', 'pit', 'cell.js')], {
    stdio: ['inherit', 'pipe', 'inherit'],
    timeout: 1500,
    encoding: 'utf8',
  })
  return /^\d+x\d+$/.test(asked.stdout ?? '') ? asked.stdout : ''
}

/** Ember-dark terminal background while Dante runs (OSC 11); the terminal's own comes back after (OSC 111). */
const BACKDROP = '#140C0A'

/** Open Claude Code inside the Dante folder with Dante's plugin and look. Returns its exit code. */
export async function launch(extra: string[]): Promise<number> {
  const claude = findClaude()
  if (!claude) {
    process.stderr.write('dante: Claude Code is not installed. Get it at https://claude.com/claude-code\n')
    return 1
  }
  const { home } = ensureHome()
  if (!existsSync(configPath(home))) {
    if (!process.stdin.isTTY) {
      process.stderr.write('dante: no dante.toml yet. Run: dante setup\n')
      return 1
    }
    const { runSetup } = await import('./setup.js')
    const code = await runSetup()
    if (code !== 0 || !existsSync(configPath(home))) return code
  }
  const { installTheme } = await import('./setup.js')
  installTheme()
  let lang = 'en'
  let animation = 'full'
  let graphics: 'auto' | 'image' | 'blocks' = 'auto'
  let voice: string | undefined
  try {
    const config = loadConfig(home)
    lang = config.ui_language
    animation = config.animation
    graphics = config.graphics
    voice = config.voice
  } catch {
    // A broken dante.toml is reported by the MCP server and doctor; the look falls back to English.
  }
  process.chdir(home)
  const tty = process.stdout.isTTY && !process.env.DANTE_NO_BACKDROP
  if (tty) process.stdout.write(`\x1b]11;${BACKDROP}\x07`)
  const isPinned = process.env.DANTE_PINNED_HEADER === '1'
  // Where the session's figures are left for the header.
  const run = isPinned ? mkdtempSync(join(tmpdir(), 'dante-')) : undefined
  const env: Record<string, string> = {
    DANTE_HOME: home,
    DANTE_UI_LANG: lang,
    DANTE_ANIMATION: animation,
    DANTE_NODE: process.execPath,
    ...(voice === undefined ? {} : { DANTE_VOICE: voice }),
    ...(run === undefined ? {} : { DANTE_RUN: run, DANTE_PINNED_HEADER: '1' }),
    ...lookEnv(graphics, cellSize),
  }
  const child = spawn(claude, claudeArgs(extra, isPinned, env), { stdio: 'inherit', env: { ...process.env, ...env } })
  // Claude Code reads Ctrl+C itself; this process only waits for it.
  const ignore = () => {}
  process.on('SIGINT', ignore)
  process.on('SIGQUIT', ignore)
  const code = await new Promise<number>(resolve => {
    child.on('exit', (c, signal) => resolve(c ?? (signal ? 128 : 1)))
    child.on('error', () => resolve(1))
  })
  if (run !== undefined) rmSync(run, { recursive: true, force: true })
  if (tty) process.stdout.write('\x1b]111\x07')
  return code
}
