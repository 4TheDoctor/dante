import { spawn } from 'node:child_process'
import { accessSync, constants, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configPath, danteHome } from './config.js'

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
  for (const file of ['CLAUDE.md', 'dante.toml']) {
    const target = join(home, file)
    if (!existsSync(target) && existsSync(join(template, file))) copyFileSync(join(template, file), target)
  }
  return { home, created }
}

export function claudeArgs(extra: string[]): string[] {
  const plugin = join(packageRoot(), 'plugin')
  return ['--plugin-dir', plugin, '--settings', join(plugin, 'settings.json'), ...extra]
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
    process.stderr.write('dante: no dante.toml yet. Run: dante setup\n')
    return 1
  }
  process.chdir(home)
  const tty = process.stdout.isTTY && !process.env.DANTE_NO_BACKDROP
  if (tty) process.stdout.write(`\x1b]11;${BACKDROP}\x07`)
  const child = spawn(claude, claudeArgs(extra), {
    stdio: 'inherit',
    env: { ...process.env, DANTE_HOME: home },
  })
  // Claude Code reads Ctrl+C itself; this process only waits for it.
  const ignore = () => {}
  process.on('SIGINT', ignore)
  process.on('SIGQUIT', ignore)
  const code = await new Promise<number>(resolve => {
    child.on('exit', (c, signal) => resolve(c ?? (signal ? 128 : 1)))
    child.on('error', () => resolve(1))
  })
  if (tty) process.stdout.write('\x1b]111\x07')
  return code
}
