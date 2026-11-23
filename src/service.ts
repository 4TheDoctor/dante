import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { danteHome, toPreferences, type DanteConfig } from './config.js'
import { AllDebrid } from './debrid/alldebrid.js'
import { pickFile, type DebridClient, type DirectLink, type Transfer } from './debrid/debrid.js'
import { RealDebrid } from './debrid/realdebrid.js'
import { TorBox } from './debrid/torbox.js'
import { planDub, type DubPlan } from './dub.js'
import { AioStreamsEngine } from './engines/aiostreams.js'
import type { Engine } from './engines/engine.js'
import { StremioAddonEngine } from './engines/stremio-addon.js'
import { TorznabEngine } from './engines/torznab.js'
import type { Fetch } from './http.js'
import { rank } from './rank.js'
import { resolveSecret } from './secrets.js'
import type { Candidate, DebridService, MediaRef, Preferences, Ranked } from './types.js'

export interface SearchResult {
  media: MediaRef
  ranked: Ranked[]
  /** One line per engine that failed; the search still uses the others. */
  errors: string[]
  /** Engines that answered and how many results each gave. */
  answered: Array<{ engine: string; count: number }>
  dub?: DubPlan
}

export interface TrackedTransfer extends Transfer {
  service: DebridService
  candidateId: string
  /** The torrent's info hash: what it is, whatever number a later list gives it. */
  hash?: string
  addedAt: string
}

export interface Deps {
  fetchImpl?: Fetch
  resolve?: (ref: string | undefined) => Promise<string | undefined>
  /** Where transfers are remembered between sessions. Defaults to DANTE_HOME/state.json. */
  statePath?: string
}

/** Dante's use cases. The MCP server and the CLI are thin adapters over this class. */
export class Dante {
  readonly prefs: Preferences
  private readonly candidates = new Map<string, Ranked>()
  private readonly medias = new Map<string, MediaRef>()
  private readonly searches: SearchResult[] = []
  private enginesCache?: Engine[]
  private debridCache?: DebridClient[]

  constructor(
    readonly config: DanteConfig,
    private readonly deps: Deps = {},
  ) {
    this.prefs = toPreferences(config)
  }

  private resolve(ref: string | undefined) {
    return (this.deps.resolve ?? resolveSecret)(ref)
  }

  async engines(): Promise<Engine[]> {
    if (this.enginesCache) return this.enginesCache
    const out: Engine[] = []
    for (const e of this.config.engines) {
      if (e.type === 'aiostreams') {
        const creds = await this.resolve(e.credentials)
        if (creds) out.push(new AioStreamsEngine(e.name, e.url, creds, this.deps.fetchImpl))
      } else if (e.type === 'stremio') {
        const url = await this.resolve(e.url)
        if (url) out.push(new StremioAddonEngine(e.name, url, this.deps.fetchImpl))
      } else {
        const key = await this.resolve(e.api_key)
        if (key) out.push(new TorznabEngine(e.name, e.url, key, this.deps.fetchImpl))
      }
    }
    this.enginesCache = out
    return out
  }

  async debrids(): Promise<DebridClient[]> {
    if (this.debridCache) return this.debridCache
    const d = this.config.debrid
    const out: DebridClient[] = []
    const ad = await this.resolve(d.alldebrid)
    if (ad) out.push(new AllDebrid(ad, this.deps.fetchImpl))
    const rd = await this.resolve(d.realdebrid)
    if (rd) out.push(new RealDebrid(rd, this.deps.fetchImpl))
    const tb = await this.resolve(d.torbox)
    if (tb) out.push(new TorBox(tb, this.deps.fetchImpl))
    this.debridCache = out
    return out
  }

  async debrid(service?: DebridService): Promise<DebridClient> {
    const all = await this.debrids()
    const client = service ? all.find(c => c.service === service) : all[0]
    if (!client) throw new Error(service ? `${service} is not configured in dante.toml` : 'no debrid service is configured in dante.toml')
    return client
  }

  async search(media: MediaRef, prefs: Partial<Preferences> = {}): Promise<SearchResult> {
    const engines = await this.engines()
    if (!engines.length) throw new Error('no engine is configured: run `dante setup` or edit dante.toml')
    const settled = await Promise.allSettled(engines.map(e => e.search(media)))
    const all: Candidate[] = []
    const errors: string[] = []
    const answered: SearchResult['answered'] = []
    settled.forEach((r, i) => {
      const engine = engines[i]!
      if (r.status === 'fulfilled') {
        answered.push({ engine: engine.name, count: r.value.length })
        all.push(...r.value)
      } else {
        errors.push(`${engine.name}: ${(r.reason as Error).message}`)
      }
    })
    const effective = { ...this.prefs, ...prefs }
    // Torznab results carry no season/episode filter of their own; keep the episode asked for.
    const wanted = all.filter(c => matchesEpisode(c, media))
    // A later list does not reuse the numbers of an earlier one.
    const nth = this.searches.length + 1
    if (nth > 1) for (const c of wanted) c.id = `${c.id}/${nth}`
    const ranked = rank(wanted, effective)
    for (const r of ranked) {
      this.candidates.set(r.candidate.id, r)
      this.medias.set(r.candidate.id, media)
    }
    const result: SearchResult = { media, ranked, errors, answered, dub: planDub(ranked, effective) }
    this.searches.push(result)
    return result
  }

  candidate(id: string): Ranked {
    const r = this.candidates.get(id)
    if (!r) throw new Error(`unknown result id ${id}: search first, then use an id from the list`)
    return r
  }

  lastSearch(): SearchResult | undefined {
    return this.searches.at(-1)
  }

  /** The film or episode a result was found for. */
  mediaOf(id: string): MediaRef {
    this.candidate(id)
    return this.medias.get(id)!
  }

  /** Fill in cache status for these results on every configured service (or one). */
  async checkCache(ids: string[], service?: DebridService): Promise<{ ranked: Ranked[]; warnings: string[] }> {
    const ranked = ids.map(id => this.candidate(id))
    const clients = service ? [await this.debrid(service)] : await this.debrids()
    if (!clients.length) throw new Error('no debrid service is configured in dante.toml')
    const warnings: string[] = []
    for (const client of clients) {
      const pending = ranked.filter(r => r.candidate.infoHash && r.candidate.cache[client.service] === undefined)
      if (!pending.length) continue
      const answer = await client.checkCached(pending.map(r => r.candidate.infoHash!))
      for (const r of pending) {
        const cached = answer[r.candidate.infoHash!.toLowerCase()]
        if (cached !== undefined) r.candidate.cache[client.service] = cached
      }
      if (client.cleanupFailures.length) {
        warnings.push(`${client.service}: added to check the cache but could not remove: ${client.cleanupFailures.join(', ')}. Remove them by hand.`)
      }
    }
    return { ranked, warnings }
  }

  async add(id: string, service?: DebridService): Promise<TrackedTransfer> {
    const r = this.candidate(id)
    const client = await this.debrid(service ?? this.preferredService(r))
    const source = r.candidate.magnet ?? r.candidate.infoHash
    if (!source) throw new Error(`${id} has no magnet or info hash to add`)
    const transfer = await client.add(source)
    const tracked: TrackedTransfer = { ...transfer, service: client.service, candidateId: id, hash: hashOf(r.candidate), addedAt: new Date().toISOString() }
    this.remember(tracked)
    return tracked
  }

  /**
   * A direct URL to play. Uses the engine's own link when it gave one (already resolved). Adds
   * nothing to the account unless `mayAdd` says the user picked this result, and then only what is
   * known to be cached: a download is always asked for with `add`.
   */
  async links(id: string, service?: DebridService, mayAdd = false): Promise<DirectLink & { via: string }> {
    const r = this.candidate(id)
    if (r.candidate.url && !service) return { url: r.candidate.url, filename: r.candidate.name, size: r.candidate.size, via: r.candidate.engine }
    const client = await this.debrid(service ?? this.preferredService(r))
    const hash = hashOf(r.candidate)
    const tracked = hash === undefined ? undefined : this.transfers().find(t => t.hash === hash && t.service === client.service)
    if (!tracked && !(mayAdd && r.candidate.cache[client.service] === true)) {
      throw new Error(
        mayAdd
          ? `${r.candidate.name} is not known to be cached on ${client.service}: check_cache first, or add_to_debrid to download it`
          : `${r.candidate.name} is not on ${client.service} yet: add_to_debrid first, once the user has picked it`,
      )
    }
    const transfer = tracked ? await client.status(tracked.id) : await this.add(id, client.service)
    if (!transfer.ready) {
      throw new Error(`${r.candidate.name} is not ready on ${client.service} yet (${transfer.status}${transfer.progress !== undefined ? ` ${transfer.progress}%` : ''}). Check again with debrid_status.`)
    }
    const file = pickFile(await client.files(transfer.id), r.candidate.name)
    if (!file) throw new Error(`no playable file in ${r.candidate.name}`)
    const link = await client.unlock(file.link)
    return { ...link, filename: link.filename ?? file.name, size: link.size ?? file.size, via: client.service }
  }

  async status(service?: DebridService): Promise<TrackedTransfer[]> {
    const out: TrackedTransfer[] = []
    for (const t of this.transfers()) {
      if (service && t.service !== service) continue
      try {
        const client = await this.debrid(t.service)
        out.push({ ...t, ...(await client.status(t.id)) })
      } catch (err) {
        out.push({ ...t, status: `unknown (${(err as Error).message})`, ready: false })
      }
    }
    this.save(out)
    return out
  }

  private preferredService(r: Ranked): DebridService | undefined {
    const cachedOn = Object.entries(r.candidate.cache).find(([, cached]) => cached)?.[0] as DebridService | undefined
    return cachedOn
  }

  private statePath(): string {
    return this.deps.statePath ?? join(danteHome(), 'state.json')
  }

  transfers(): TrackedTransfer[] {
    try {
      return (JSON.parse(readFileSync(this.statePath(), 'utf8')) as { transfers: TrackedTransfer[] }).transfers ?? []
    } catch {
      return []
    }
  }

  private remember(t: TrackedTransfer): void {
    this.save([...this.transfers().filter(x => !(x.id === t.id && x.service === t.service)), t])
  }

  private save(transfers: TrackedTransfer[]): void {
    try {
      mkdirSync(join(this.statePath(), '..'), { recursive: true })
      writeFileSync(this.statePath(), `${JSON.stringify({ transfers: transfers.slice(-50) }, null, 2)}\n`)
    } catch {
      // State is a convenience; never fail a request over it.
    }
  }
}

function hashOf(c: Candidate): string | undefined {
  return (c.infoHash ?? /btih:([a-z0-9]+)/i.exec(c.magnet ?? '')?.[1])?.toLowerCase()
}

/** Keep results for the episode asked for (or packs that include it). Films pass through. */
export function matchesEpisode(c: Candidate, media: MediaRef): boolean {
  if (media.type !== 'series' || media.season === undefined) return true
  const text = `${c.name} ${c.folder ?? ''}`
  const se = /s(\d{1,2}) ?e(\d{1,3})/i.exec(text)
  if (se) {
    const [season, episode] = [Number(se[1]), Number(se[2])]
    if (season !== media.season) return false
    if (media.episode === undefined) return true
    const range = /s\d{1,2}e(\d{1,3}) ?- ?e?(\d{1,3})/i.exec(text)
    if (range) return media.episode >= Number(range[1]) && media.episode <= Number(range[2])
    return episode === media.episode
  }
  const x = /(?<!\d)(\d{1,2})x(\d{2,3})(?!\d)/i.exec(text)
  if (x) return Number(x[1]) === media.season && (media.episode === undefined || Number(x[2]) === media.episode)
  const cap = /cap\.? ?(\d{3,4})/i.exec(text)
  if (cap) {
    const n = cap[1]!
    return Number(n.slice(0, -2)) === media.season && (media.episode === undefined || Number(n.slice(-2)) === media.episode)
  }
  const season = /(?:^|[^a-z])s(\d{1,2})(?![\de])|season (\d{1,2})|temporada (\d{1,2})/i.exec(text)
  if (season) return Number(season[1] ?? season[2] ?? season[3]) === media.season
  return true
}
