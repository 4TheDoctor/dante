import { request, redactUrl, HttpError, type Fetch } from '../http.js'
import type { Candidate, MediaRef } from '../types.js'
import type { Engine } from './engine.js'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      return ENTITIES[ent.toLowerCase()] ?? whole
    })
}

function tag(item: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  return m ? decodeXml(m[1]!.trim()) : undefined
}

function attr(item: string, name: string): string | undefined {
  const m = new RegExp(`<torznab:attr\\s+name="${name}"\\s+value="([^"]*)"`, 'i').exec(item)
  return m ? decodeXml(m[1]!) : undefined
}

export function hashFromMagnet(magnet: string): string | undefined {
  const m = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet)
  if (!m) return undefined
  const hash = m[1]!
  return hash.length === 40 ? hash.toLowerCase() : undefined
}

/** Parse a Torznab RSS response (Jackett and Prowlarr both return this shape). */
export function parseTorznab(xml: string, engine: string): Candidate[] {
  const error = /<error\s+code="(\d+)"\s+description="([^"]*)"/i.exec(xml)
  if (error) throw new HttpError(`${engine}: torznab error ${error[1]}: ${decodeXml(error[2]!)}`, undefined, error[1])
  const out: Candidate[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1]!
    const title = tag(item, 'title')
    if (!title) continue
    const magnetAttr = attr(item, 'magneturl')
    const link = tag(item, 'link')
    const magnet = magnetAttr ?? (link?.startsWith('magnet:') ? link : undefined)
    const infoHash = attr(item, 'infohash')?.toLowerCase() ?? (magnet ? hashFromMagnet(magnet) : undefined)
    const size = Number(tag(item, 'size') ?? attr(item, 'size'))
    const seeders = Number(attr(item, 'seeders'))
    const indexer = /<(?:jackett|prowlarr)indexer[^>]*>([^<]*)</i.exec(item)?.[1]
    out.push({
      id: `${engine}:${out.length}`,
      engine,
      name: title,
      infoHash,
      magnet,
      size: Number.isFinite(size) && size > 0 ? size : undefined,
      seeders: Number.isFinite(seeders) ? seeders : undefined,
      source: indexer ? decodeXml(indexer) : undefined,
      languages: [],
      multiAudio: false,
      cache: {},
    })
  }
  return out
}

/** The text queries to send for a title: torznab indexers match names, not ids, reliably. */
export function torznabQueries(media: MediaRef): Array<Record<string, string>> {
  const title = (media.title ?? '').replace(/[:'’!?,.]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title) return []
  if (media.type === 'series' && media.season !== undefined) {
    const s = String(media.season).padStart(2, '0')
    const queries: Array<Record<string, string>> = []
    if (media.episode !== undefined) {
      const e = String(media.episode).padStart(2, '0')
      queries.push({ t: 'search', q: `${title} S${s}E${e}`, cat: '5000' })
    }
    queries.push({ t: 'search', q: `${title} S${s}`, cat: '5000' })
    return queries
  }
  return [{ t: 'search', q: media.year ? `${title} ${media.year}` : title, cat: '2000' }]
}

/**
 * Jackett or Prowlarr through Torznab. `url` is the torznab endpoint, e.g.
 * http://localhost:9117/api/v2.0/indexers/all/results/torznab/api (Jackett) or
 * http://localhost:9696/1/api (one Prowlarr indexer).
 */
export class TorznabEngine implements Engine {
  readonly kind = 'torznab'
  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly apiKey: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  describe(): string {
    return `${this.name} (Torznab at ${redactUrl(this.url)})`
  }

  async ping(): Promise<string> {
    const query = new URLSearchParams({ t: 'caps', apikey: this.apiKey })
    const res = await request(`${this.url}?${query}`, { fetchImpl: this.fetchImpl, timeoutMs: 15_000 })
    const body = await res.text()
    if (!res.ok || /<error/i.test(body)) throw new HttpError(`${this.name}: ${res.ok ? 'torznab error' : `HTTP ${res.status}`}`, res.status)
    return 'torznab caps OK'
  }

  async search(media: MediaRef): Promise<Candidate[]> {
    const out: Candidate[] = []
    for (const params of torznabQueries(media)) {
      const query = new URLSearchParams({ ...params, apikey: this.apiKey })
      const res = await request(`${this.url}?${query}`, { fetchImpl: this.fetchImpl, timeoutMs: 60_000 })
      if (!res.ok) throw new HttpError(`${this.name}: HTTP ${res.status}`, res.status)
      for (const c of parseTorznab(await res.text(), this.name)) {
        out.push({ ...c, id: `${this.name}:${out.length}` })
      }
    }
    return out
  }
}
