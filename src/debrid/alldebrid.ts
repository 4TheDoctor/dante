import { form, getJson, HttpError, type Fetch } from '../http.js'
import { toMagnet, type Account, type DebridClient, type DebridFile, type DirectLink, type Transfer } from './debrid.js'

const BASE = 'https://api.alldebrid.com'

interface AdEnvelope<T> {
  status: 'success' | 'error'
  data?: T
  error?: { code: string; message: string }
}

interface AdMagnet {
  id: number
  hash?: string
  name?: string
  filename?: string
  size?: number
  ready?: boolean
  status?: string
  statusCode?: number
  downloaded?: number
  error?: { code: string; message: string }
}

interface AdFileNode {
  n: string
  s?: number
  l?: string
  e?: AdFileNode[]
}

/** Flatten AllDebrid's nested file tree into paths. */
export function flattenAdFiles(nodes: AdFileNode[], prefix = ''): DebridFile[] {
  const out: DebridFile[] = []
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.n}` : node.n
    if (node.e) out.push(...flattenAdFiles(node.e, path))
    else if (node.l) out.push({ name: path, size: node.s, link: node.l })
  }
  return out
}

/**
 * AllDebrid API v4 (v4.1 for magnet/status). Docs: docs.alldebrid.com. AllDebrid has no
 * read-only cache check: `magnet/upload` adds the magnet and answers `ready: true` when cached.
 */
export class AllDebrid implements DebridClient {
  readonly service = 'alldebrid' as const
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: Fetch,
  ) {}

  private async call<T>(path: string, fields: Record<string, string | string[] | undefined> = {}): Promise<T> {
    const body = await getJson<AdEnvelope<T>>(`${BASE}${path}?agent=dante`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form(fields),
      fetchImpl: this.fetchImpl,
    })
    if (body.status !== 'success' || body.data === undefined) {
      throw new HttpError(`AllDebrid: ${body.error?.code ?? 'error'}: ${body.error?.message ?? 'request failed'}`, undefined, body.error?.code)
    }
    return body.data
  }

  private async allMagnets(): Promise<AdMagnet[]> {
    const data = await this.call<{ magnets: AdMagnet[] | Record<string, AdMagnet> }>('/v4.1/magnet/status')
    return Array.isArray(data.magnets) ? data.magnets : Object.values(data.magnets)
  }

  async checkCached(hashes: string[]): Promise<Record<string, boolean>> {
    if (!hashes.length) return {}
    const before = new Set((await this.allMagnets()).map(m => m.hash?.toLowerCase()).filter(Boolean))
    const data = await this.call<{ magnets: AdMagnet[] }>('/v4/magnet/upload', { 'magnets[]': hashes })
    const result: Record<string, boolean> = {}
    for (const [i, m] of data.magnets.entries()) {
      const hash = (m.hash ?? hashes[i])!.toLowerCase()
      result[hash] = m.error ? false : Boolean(m.ready)
      // Only remove what this check added; never a magnet the user already had.
      if (!m.error && m.id !== undefined && !before.has(hash)) await this.remove(String(m.id)).catch(() => {})
    }
    return result
  }

  async add(magnetOrHash: string): Promise<Transfer> {
    const data = await this.call<{ magnets: AdMagnet[] }>('/v4/magnet/upload', { 'magnets[]': [toMagnet(magnetOrHash)] })
    const m = data.magnets[0]
    if (!m || m.error) throw new HttpError(`AllDebrid: ${m?.error?.message ?? 'upload failed'}`, undefined, m?.error?.code)
    return { id: String(m.id), name: m.name, ready: Boolean(m.ready), status: m.ready ? 'Ready' : 'Queued' }
  }

  async status(id: string): Promise<Transfer> {
    const data = await this.call<{ magnets: AdMagnet | AdMagnet[] }>('/v4.1/magnet/status', { id })
    const m = Array.isArray(data.magnets) ? data.magnets[0] : data.magnets
    if (!m) throw new HttpError(`AllDebrid: magnet ${id} not found`)
    const ready = m.statusCode === 4
    const progress = m.size && m.downloaded !== undefined ? Math.round((100 * m.downloaded) / m.size) : undefined
    return { id, name: m.filename ?? m.name, ready, status: m.status ?? (ready ? 'Ready' : 'Processing'), progress }
  }

  async files(id: string): Promise<DebridFile[]> {
    const data = await this.call<{ magnets: Array<{ id: number; files?: AdFileNode[]; error?: { message: string } }> }>(
      '/v4/magnet/files',
      { 'id[]': [id] },
    )
    const m = data.magnets[0]
    if (!m || m.error) throw new HttpError(`AllDebrid: ${m?.error?.message ?? 'no files'}`)
    return flattenAdFiles(m.files ?? [])
  }

  async unlock(link: string): Promise<DirectLink> {
    const data = await this.call<{ link: string; filename?: string; filesize?: number }>('/v4/link/unlock', { link })
    return { url: data.link, filename: data.filename, size: data.filesize }
  }

  async remove(id: string): Promise<void> {
    await this.call('/v4/magnet/delete', { id })
  }

  async account(): Promise<Account> {
    const body = await getJson<AdEnvelope<{ user: { username?: string; isPremium?: boolean; premiumUntil?: number } }>>(
      `${BASE}/v4/user?agent=dante`,
      { headers: { authorization: `Bearer ${this.apiKey}` }, fetchImpl: this.fetchImpl },
    )
    if (body.status !== 'success' || !body.data) throw new HttpError(`AllDebrid: ${body.error?.message ?? 'account check failed'}`)
    const u = body.data.user
    return {
      username: u.username,
      premium: Boolean(u.isPremium),
      expires: u.premiumUntil ? new Date(u.premiumUntil * 1000).toISOString().slice(0, 10) : undefined,
    }
  }
}
