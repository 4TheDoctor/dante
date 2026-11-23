import { execFile, spawn } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Keychain account all Dante secrets live under. */
export const ACCOUNT = 'dante'

/**
 * A reference to a secret, as written in dante.toml:
 * - `keychain:dante.alldebrid` — macOS Keychain (or the Secret Service on Linux), account "dante"
 * - `env:ALLDEBRID_KEY` — an environment variable
 *
 * A `keychain:` reference also falls back to the environment: `keychain:dante.alldebrid` reads
 * `DANTE_ALLDEBRID` when the keychain has nothing, which is what CI and containers use.
 */
export type SecretRef = string

export function envNameFor(service: string): string {
  return service.replace(/^dante\./, 'DANTE_').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
}

async function keychainRead(service: string): Promise<string | undefined> {
  try {
    if (platform() === 'darwin') {
      const { stdout } = await run('security', ['find-generic-password', '-a', ACCOUNT, '-s', service, '-w'])
      return stdout.trim() || undefined
    }
    const { stdout } = await run('secret-tool', ['lookup', 'service', service, 'account', ACCOUNT])
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

export async function resolveSecret(ref: SecretRef | undefined): Promise<string | undefined> {
  if (!ref) return undefined
  if (ref.startsWith('env:')) return process.env[ref.slice(4)] || undefined
  if (ref.startsWith('keychain:')) {
    const service = ref.slice('keychain:'.length)
    return (await keychainRead(service)) ?? (process.env[envNameFor(service)] || undefined)
  }
  // A literal value in the config file works, but setup never writes one.
  return ref
}

/** Store a secret without putting it on a command line (which other processes can read). */
export async function storeSecret(service: string, value: string, label = `Dante ${service}`): Promise<void> {
  if (!/^[\x20-\x7e]+$/.test(value)) throw new Error('secret contains characters that cannot be stored safely')
  if (platform() === 'darwin') {
    const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    const line = `add-generic-password -U -a ${q(ACCOUNT)} -s ${q(service)} -l ${q(label)} -w ${q(value)}\n`
    await feed('security', ['-i'], line)
    return
  }
  await feed('secret-tool', ['store', `--label=${label}`, 'service', service, 'account', ACCOUNT], value)
}

function feed(command: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', d => (err += String(d)))
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${command} failed: ${err.trim() || `exit ${code}`}`))))
    child.stdin.end(input)
  })
}
