import { form, HttpError, request, type Fetch } from '../http.js'
import { toMagnet, type Account, type DebridClient, type DebridFile, type DirectLink, type Transfer } from './debrid.js'

const BASE = 'https://api.real-debrid.com/rest/1.0'

interface RdTorrent {
  id: string
  hash?: string
  filename?: string
  status: string
  progress?: number
  files?: Array<{ id: number; path: string; bytes: number; selected: number }>
  links?: string[]
}

/** Error codes worth explaining instead of passing on (api.real-debrid.com, "Error codes"). */
const RD_ERRORS: Record<number, string> = {
  8: 'the API token is not valid',
  9: 'permission denied (is the account premium?)',
  20: 'the account is not premium',
  35: 'Real-Debrid blocks this file for copyright (infringing_file); pick another release',
  37: 'the endpoint is disabled by Real-Debrid',
}

/**
 * Real-Debrid. It has had no cache-check endpoint since November 2024 (instantAvailability
 * answers error 37), so `checkCached` adds the torrent, looks whether it is already downloaded,
 * and removes it again unless the user had it before.
 */
export class RealDebrid implements DebridClient {
  cleanupFailures: string[] = []
  readonly service = 'realdebrid' as const
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  private async call<T>(method: string, path: string, fields?: Record<string, string>): Promise<T | undefined> {
    const res = await request(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: fields ? form(fields) : undefined,
      fetchImpl: this.fetchImpl,
    })
    if (res.status === 204) return undefined
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      throw new HttpError(`Real-Debrid: HTTP ${res.status}`, res.status)
    }
    if (!res.ok) {
      const err = body as { error?: string; error_code?: number } | undefined
      const code = err?.error_code
      const why = (code !== undefined && RD_ERRORS[code]) || err?.error || `HTTP ${res.status}`
      throw new HttpError(`Real-Debrid: ${why}`, res.status, code === undefined ? err?.error : String(code))
    }
    return body as T
  }

  async checkCached(hashes: string[]): Promise<Record<string, boolean>> {
    this.cleanupFailures = []
    const before = new Set(((await this.call<RdTorrent[]>('GET', '/torrents?limit=2500')) ?? []).map(t => t.hash?.toLowerCase()))
    const result: Record<string, boolean> = {}
    for (const raw of hashes) {
      const hash = raw.toLowerCase()
      let id: string | undefined
      try {
        const added = await this.call<{ id: string }>('POST', '/torrents/addMagnet', { magnet: toMagnet(hash) })
        id = added?.id
        if (!id) continue
        await this.call('POST', `/torrents/selectFiles/${id}`, { files: 'all' })
        const info = await this.call<RdTorrent>('GET', `/torrents/info/${id}`)
        result[hash] = info?.status === 'downloaded'
      } catch {
        result[hash] = false
      } finally {
        if (id && !before.has(hash)) await this.remove(id).catch(() => this.cleanupFailures.push(hash))
      }
    }
    return result
  }

  async add(magnetOrHash: string): Promise<Transfer> {
    const added = await this.call<{ id: string }>('POST', '/torrents/addMagnet', { magnet: toMagnet(magnetOrHash) })
    if (!added) throw new HttpError('Real-Debrid: add failed')
    await this.call('POST', `/torrents/selectFiles/${added.id}`, { files: 'all' })
    return this.status(added.id)
  }

  async status(id: string): Promise<Transfer> {
    const t = await this.call<RdTorrent>('GET', `/torrents/info/${id}`)
    if (!t) throw new HttpError(`Real-Debrid: torrent ${id} not found`)
    return { id, name: t.filename, ready: t.status === 'downloaded', status: t.status, progress: t.progress }
  }

  async files(id: string): Promise<DebridFile[]> {
    const t = await this.call<RdTorrent>('GET', `/torrents/info/${id}`)
    if (!t) return []
    // `links` follow the selected files in order.
    const selected = (t.files ?? []).filter(f => f.selected === 1)
    return selected.flatMap((f, i) => {
      const link = t.links?.[i]
      return link ? [{ name: f.path.replace(/^\//, ''), size: f.bytes, link }] : []
    })
  }

  async unlock(link: string): Promise<DirectLink> {
    const data = await this.call<{ download: string; filename?: string; filesize?: number }>('POST', '/unrestrict/link', { link })
    if (!data) throw new HttpError('Real-Debrid: unrestrict failed')
    return { url: data.download, filename: data.filename, size: data.filesize }
  }

  async remove(id: string): Promise<void> {
    await this.call('DELETE', `/torrents/delete/${id}`)
  }

  async account(): Promise<Account> {
    const u = await this.call<{ username?: string; type?: string; expiration?: string }>('GET', '/user')
    return { username: u?.username, premium: u?.type === 'premium', expires: u?.expiration?.slice(0, 10) }
  }
}
