import { form, getJson, HttpError, type Fetch } from '../http.js'
import { toMagnet, type Account, type DebridClient, type DebridFile, type DirectLink, type Transfer } from './debrid.js'

const BASE = 'https://api.torbox.app/v1/api'

interface TbEnvelope<T> {
  success: boolean
  detail?: string
  error?: string | null
  data?: T
}

interface TbTorrent {
  id: number
  hash?: string
  name?: string
  download_state?: string
  download_finished?: boolean
  progress?: number
  files?: Array<{ id: number; name: string; short_name?: string; size: number }>
}

/** TorBox. The only one of the three with a read-only cache check (`torrents/checkcached`). */
export class TorBox implements DebridClient {
  cleanupFailures: string[] = []
  readonly service = 'torbox' as const
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const body = await getJson<TbEnvelope<T>>(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      fetchImpl: this.fetchImpl,
    })
    if (!body.success) throw new HttpError(`TorBox: ${body.detail ?? body.error ?? 'request failed'}`)
    return body.data as T
  }

  private async post<T>(path: string, fields: Record<string, string>): Promise<T> {
    const body = await getJson<TbEnvelope<T>>(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form(fields),
      fetchImpl: this.fetchImpl,
    })
    if (!body.success) throw new HttpError(`TorBox: ${body.detail ?? body.error ?? 'request failed'}`)
    return body.data as T
  }

  async checkCached(hashes: string[]): Promise<Record<string, boolean>> {
    if (!hashes.length) return {}
    const query = new URLSearchParams({ hash: hashes.join(','), format: 'object', list_files: 'false' })
    const data = (await this.get<Record<string, unknown> | null>(`/torrents/checkcached?${query}`)) ?? {}
    const cached = new Set(Object.keys(data).map(h => h.toLowerCase()))
    return Object.fromEntries(hashes.map(h => [h.toLowerCase(), cached.has(h.toLowerCase())]))
  }

  async add(magnetOrHash: string): Promise<Transfer> {
    const data = await this.post<{ torrent_id: number; name?: string }>('/torrents/createtorrent', { magnet: toMagnet(magnetOrHash) })
    return this.status(String(data.torrent_id))
  }

  async status(id: string): Promise<Transfer> {
    const t = await this.get<TbTorrent>(`/torrents/mylist?id=${encodeURIComponent(id)}&bypass_cache=true`)
    const ready = Boolean(t.download_finished)
    return {
      id,
      name: t.name,
      ready,
      status: t.download_state ?? (ready ? 'completed' : 'queued'),
      progress: t.progress === undefined ? undefined : Math.round(t.progress * 100),
    }
  }

  async files(id: string): Promise<DebridFile[]> {
    const t = await this.get<TbTorrent>(`/torrents/mylist?id=${encodeURIComponent(id)}&bypass_cache=true`)
    return (t.files ?? []).map(f => ({ name: f.name, size: f.size, link: `${id}:${f.id}` }))
  }

  /** `link` is "<torrent_id>:<file_id>" as returned by `files`. */
  async unlock(link: string): Promise<DirectLink> {
    const [torrentId, fileId] = link.split(':')
    const query = new URLSearchParams({ token: this.apiKey, torrent_id: torrentId ?? '', file_id: fileId ?? '' })
    const url = await this.get<string>(`/torrents/requestdl?${query}`)
    return { url }
  }

  async remove(id: string): Promise<void> {
    await getJson<TbEnvelope<unknown>>(`${BASE}/torrents/controltorrent`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ torrent_id: Number(id), operation: 'delete' }),
      fetchImpl: this.fetchImpl,
    })
  }

  async account(): Promise<Account> {
    const u = await this.get<{ plan?: number; premium_expires_at?: string }>('/user/me')
    return { premium: (u.plan ?? 0) > 0, expires: u.premium_expires_at?.slice(0, 10) }
  }
}
