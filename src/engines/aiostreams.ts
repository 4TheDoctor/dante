import { getJson, HttpError, redactUrl, request, type Fetch } from '../http.js'
import { normLanguage } from '../languages.js'
import { DEBRID_SERVICES, type Candidate, type DebridService, type MediaRef } from '../types.js'
import type { Engine } from './engine.js'

/** The fields Dante reads from AIOStreams' SearchApiResult (packages/core/src/transformers/api.ts). */
export interface AioResult {
  infoHash: string | null
  fileIdx: number | null
  url: string | null
  filename: string | null
  folderName: string | null
  size: number | null
  seeders: number | null
  indexer: string | null
  addon: string | null
  service: string | null
  cached: boolean | null
  parsedFile?: { languages?: string[]; resolution?: string; visualTags?: string[] }
}

interface AioResponse {
  success: boolean
  error: { code: string; message: string } | null
  data: { results: AioResult[]; errors: Array<{ title: string; description: string }> } | null
}

export function normService(service: string | null): DebridService | undefined {
  if (!service) return undefined
  const s = service.toLowerCase().replace(/[^a-z]/g, '')
  return (DEBRID_SERVICES as readonly string[]).includes(s) ? (s as DebridService) : undefined
}

export function aioToCandidate(r: AioResult, engine: string, n: number): Candidate | undefined {
  const name = r.filename ?? r.folderName
  if (!name) return undefined
  const langs = r.parsedFile?.languages ?? []
  const languages = [...new Set(langs.map(l => normLanguage(l)).filter((l): l is string => l !== undefined))]
  const service = normService(r.service)
  return {
    id: `${engine}:${n}`,
    engine,
    name,
    folder: r.folderName && r.folderName !== name ? r.folderName : undefined,
    infoHash: r.infoHash?.toLowerCase() ?? undefined,
    fileIdx: r.fileIdx ?? undefined,
    url: r.url ?? undefined,
    size: r.size ?? undefined,
    seeders: r.seeders ?? undefined,
    source: r.indexer ?? r.addon ?? undefined,
    languages,
    multiAudio: langs.some(l => /multi|dual/i.test(l)),
    cache: service && r.cached !== null ? { [service]: r.cached } : {},
  }
}

/**
 * AIOStreams' REST search (docs: aiostreams.org/apis/search). It already merges every addon and
 * debrid service the user configured in AIOStreams and says, per result, whether it is cached.
 */
export class AioStreamsEngine implements Engine {
  readonly kind = 'aiostreams'
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    /** "uuid:password" from the AIOStreams config page. */
    private readonly credentials: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  describe(): string {
    return `${this.name} (AIOStreams at ${redactUrl(this.baseUrl)})`
  }

  async ping(): Promise<string> {
    const res = await request(`${this.baseUrl.replace(/\/$/, '')}/stremio/manifest.json`, { fetchImpl: this.fetchImpl, timeoutMs: 15_000 })
    if (!res.ok) throw new HttpError(`${this.name}: HTTP ${res.status}`, res.status)
    return 'reachable'
  }

  async search(media: MediaRef): Promise<Candidate[]> {
    const id =
      media.type === 'series' && media.season !== undefined && media.episode !== undefined
        ? `${media.imdbId}:${media.season}:${media.episode}`
        : media.imdbId
    const base = this.baseUrl.replace(/\/$/, '')
    const query = new URLSearchParams({ type: media.type, id })
    const body = await getJson<AioResponse>(`${base}/api/v1/search?${query}`, {
      fetchImpl: this.fetchImpl,
      timeoutMs: 60_000,
      headers: { authorization: `Basic ${Buffer.from(this.credentials).toString('base64')}` },
    })
    if (!body.success || !body.data) {
      throw new HttpError(`${this.name}: ${body.error?.code ?? 'error'}: ${body.error?.message ?? 'search failed'}`)
    }
    const out: Candidate[] = []
    for (const r of body.data.results) {
      const c = aioToCandidate(r, this.name, out.length)
      if (c) out.push(c)
    }
    return out
  }
}
