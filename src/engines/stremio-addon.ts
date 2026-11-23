import { getJson, parseSize, redactUrl, type Fetch } from '../http.js'
import { languagesFromFlags } from '../languages.js'
import type { Candidate, DebridService, MediaRef } from '../types.js'
import type { Engine } from './engine.js'

/** A stream as the Stremio addon protocol returns it. */
export interface StremioStream {
  name?: string
  title?: string
  description?: string
  url?: string
  infoHash?: string
  fileIdx?: number
  behaviorHints?: { filename?: string; videoSize?: number; bingeGroup?: string }
}

/** Short service tags addons print in brackets: [RD+], [AD⚡], [TB download]. */
const TAGS: Record<string, DebridService> = {
  RD: 'realdebrid',
  AD: 'alldebrid',
  TB: 'torbox',
  PM: 'premiumize',
  DL: 'debridlink',
  OC: 'offcloud',
  ED: 'easydebrid',
  PP: 'pikpak',
}

/** Cache status from the stream's name: `[RD+]`/`[RD⚡]` cached, `[RD download]`/`[RD⬇️]` not. */
export function cacheFromName(name: string): Partial<Record<DebridService, boolean>> {
  const cache: Partial<Record<DebridService, boolean>> = {}
  for (const m of name.matchAll(/\[([A-Z]{2})\s*([^\]]*)\]/g)) {
    const service = TAGS[m[1]!]
    if (!service) continue
    const mark = m[2]!.trim().toLowerCase()
    if (/^(\+|⚡|✓|✅|cached)/u.test(mark)) cache[service] = true
    else if (/(download|⬇|⏳|uncached)/u.test(mark)) cache[service] = false
  }
  return cache
}

const VIDEO = /\.(mkv|mp4|avi|m2ts|ts|iso|wmv|mov|webm)$/i

/** Turn one addon stream into a candidate. Returns undefined for streams that are not video files. */
export function streamToCandidate(stream: StremioStream, engine: string, n: number): Candidate | undefined {
  const text = stream.description ?? stream.title ?? ''
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fileLine = lines.find(l => VIDEO.test(l))
  const name = stream.behaviorHints?.filename ?? fileLine ?? lines[0]
  if (!name) return undefined
  const folder = lines[0] && lines[0] !== name && !lines[0].startsWith('👤') ? lines[0] : undefined
  const seeders = /👤\s*(\d+)/u.exec(text)?.[1]
  const source = /⚙️\s*([^\n]+)/u.exec(text)?.[1]?.trim()
  return {
    id: `${engine}:${n}`,
    engine,
    name,
    folder,
    infoHash: stream.infoHash?.toLowerCase(),
    fileIdx: stream.fileIdx,
    url: stream.url,
    size: stream.behaviorHints?.videoSize ?? parseSize(text),
    seeders: seeders === undefined ? undefined : Number(seeders),
    source,
    languages: languagesFromFlags(text),
    multiAudio: /multi audio|dual audio/i.test(text),
    cache: cacheFromName(stream.name ?? ''),
  }
}

export function streamPath(media: MediaRef): string {
  const id =
    media.type === 'series' && media.season !== undefined && media.episode !== undefined
      ? `${media.imdbId}:${media.season}:${media.episode}`
      : media.imdbId
  return `/stream/${media.type}/${encodeURIComponent(id)}.json`
}

/**
 * Any addon that speaks the Stremio protocol: Comet, Torrentio, MediaFusion, a Stremio-format
 * AIOStreams URL. `baseUrl` is the manifest URL without `/manifest.json`; it usually carries the
 * addon's config (and your debrid key), so it is treated as a secret.
 */
export class StremioAddonEngine implements Engine {
  readonly kind = 'stremio'
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  describe(): string {
    return `${this.name} (Stremio addon at ${redactUrl(this.baseUrl)})`
  }

  async ping(): Promise<string> {
    const base = this.baseUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '')
    const manifest = await getJson<{ name?: string; version?: string }>(`${base}/manifest.json`, { fetchImpl: this.fetchImpl })
    return `${manifest.name ?? 'addon'} ${manifest.version ?? ''}`.trim()
  }

  async search(media: MediaRef): Promise<Candidate[]> {
    const base = this.baseUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '')
    const body = await getJson<{ streams?: StremioStream[] }>(`${base}${streamPath(media)}`, {
      fetchImpl: this.fetchImpl,
      timeoutMs: 30_000,
    })
    const out: Candidate[] = []
    for (const stream of body.streams ?? []) {
      const c = streamToCandidate(stream, this.name, out.length)
      if (c) out.push(c)
    }
    return out
  }
}
