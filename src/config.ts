import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { z } from 'zod'
import type { HdrFormat, Preferences, Resolution } from './types.js'

export function danteHome(): string {
  return process.env.DANTE_HOME || join(homedir(), 'Dante')
}

/** A folder from dante.toml: "~" expands, relative paths are inside the Dante folder. */
export function resolvePath(path: string, home = danteHome()): string {
  if (path === '~' || path.startsWith('~/')) return join(homedir(), path.slice(1))
  return resolve(home, path)
}

export function configPath(home = danteHome()): string {
  return join(home, 'dante.toml')
}

const resolution = z.enum(['2160p', '1440p', '1080p', '720p', '576p', '480p'])
const hdr = z.enum(['DV', 'HDR10+', 'HDR10', 'HDR', 'HLG'])

const engine = z.discriminatedUnion('type', [
  z.object({ type: z.literal('aiostreams'), name: z.string().default('aiostreams'), url: z.string().url(), credentials: z.string() }),
  z.object({ type: z.literal('stremio'), name: z.string(), url: z.string() }),
  z.object({ type: z.literal('torznab'), name: z.string(), url: z.string().url(), api_key: z.string() }),
])

const schema = z.object({
  ui_language: z.enum(['en', 'es']).default('en'),
  /** How much the Inferno moves: all the time, only while working, or not at all. */
  animation: z.enum(['full', 'calm', 'off']).default('full'),
  /** How the circles are drawn: as pictures (kitty, Ghostty), or with block characters anywhere. */
  graphics: z.enum(['auto', 'image', 'blocks']).default('auto'),
  /** The VoiceMode voice Dante speaks with, where there is one. */
  voice: z.string().regex(/^[\w.-]{1,64}$/, 'a voice is named with letters, digits, dots and dashes').optional(),
  preferences: z
    .object({
      resolutions: z.array(resolution).default(['2160p', '1080p']),
      hdr: z.array(hdr).default(['DV', 'HDR10+', 'HDR10']),
      languages: z.array(z.string()).default([]),
      dub_fallback: z.boolean().default(true),
      prefer_full_disc: z.boolean().default(false),
      min_size_gb: z.number().positive().optional(),
      max_size_gb: z.number().positive().optional(),
      avoid: z.array(z.string()).default(['CAM', '3D']),
    })
    .default({
      resolutions: ['2160p', '1080p'],
      hdr: ['DV', 'HDR10+', 'HDR10'],
      languages: [],
      dub_fallback: true,
      prefer_full_disc: false,
      avoid: ['CAM', '3D'],
    }),
  engines: z.array(engine).default([]),
  debrid: z
    .object({
      alldebrid: z.string().optional(),
      realdebrid: z.string().optional(),
      torbox: z.string().optional(),
    })
    .default({}),
  play: z
    .object({
      player: z.enum(['auto', 'iina', 'vlc', 'mpv', 'stremio']).default('auto'),
      /** Port of Dante's local Stremio addon. */
      port: z.number().int().default(7879),
    })
    .default({ player: 'auto', port: 7879 }),
  bdmv: z
    .object({
      /** Where menus are copied for full-disc playback; relative to the Dante folder, or ~ or absolute. */
      library: z.string().default('library'),
    })
    .default({ library: 'library' }),
})

export type DanteConfig = z.infer<typeof schema>
export type EngineConfig = z.infer<typeof engine>

export class ConfigError extends Error {}

export function parseConfig(text: string): DanteConfig {
  let raw: unknown
  try {
    raw = parse(text)
  } catch (err) {
    throw new ConfigError(`dante.toml is not valid TOML: ${(err as Error).message}`)
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new ConfigError(`dante.toml: ${issues}`)
  }
  return result.data
}

export function loadConfig(home = danteHome()): DanteConfig {
  const path = configPath(home)
  if (!existsSync(path)) return parseConfig('')
  return parseConfig(readFileSync(path, 'utf8'))
}

export function toPreferences(config: DanteConfig): Preferences {
  const p = config.preferences
  return {
    resolutions: p.resolutions as Resolution[],
    hdr: p.hdr as HdrFormat[],
    languages: p.languages,
    dubFallback: p.dub_fallback,
    preferFullDisc: p.prefer_full_disc,
    minSizeGB: p.min_size_gb,
    maxSizeGB: p.max_size_gb,
    avoid: p.avoid,
  }
}
