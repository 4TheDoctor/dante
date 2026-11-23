/** Small fetch helpers: timeouts, JSON, and errors that never carry secrets. */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export type Fetch = typeof fetch

const DEFAULT_TIMEOUT_MS = 20_000

/** A URL safe to show: host and path only, never query strings or long path tokens. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname
      .split('/')
      .map(part => (part.length >= 16 ? '…' : part))
      .join('/')
    return `${u.protocol}//${u.host}${path}`
  } catch {
    return '(invalid URL)'
  }
}

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: BodyInit
  timeoutMs?: number
  fetchImpl?: Fetch
}

export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    return await fetchImpl(url, {
      method: opts.method ?? 'GET',
      headers: { 'user-agent': 'dante (+https://github.com/4TheDoctor/dante)', ...opts.headers },
      body: opts.body,
      signal: controller.signal,
    })
  } catch (err) {
    const reason = (err as Error).name === 'AbortError' ? 'timed out' : (err as Error).message
    throw new HttpError(`${redactUrl(url)}: ${reason}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts)
  const text = await res.text()
  if (!res.ok && !text.trim().startsWith('{')) {
    throw new HttpError(`${redactUrl(url)}: HTTP ${res.status}`, res.status)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(`${redactUrl(url)}: HTTP ${res.status}, not JSON`, res.status)
  }
}

export function form(fields: Record<string, string | string[] | number | undefined>): URLSearchParams {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (Array.isArray(value)) value.forEach(v => body.append(key, v))
    else body.append(key, String(value))
  }
  return body
}

/**
 * Follow redirects by hand and return the last URL. Engine playback links (Comet, AIOStreams)
 * carry the user's config, debrid key included, in their path; the debrid CDN link they redirect
 * to does not, so that is the one worth showing or handing to a player.
 */
export async function resolveFinalUrl(url: string, fetchImpl: Fetch = fetch, hops = 5): Promise<{ url: string; resolved: boolean }> {
  let current = url
  for (let i = 0; i < hops; i++) {
    let res: Response
    try {
      res = await fetchImpl(current, { method: 'GET', redirect: 'manual', headers: { range: 'bytes=0-0' } })
    } catch {
      return { url: current, resolved: current !== url }
    }
    const location = res.headers.get('location')
    await res.body?.cancel().catch(() => {})
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString()
      continue
    }
    return { url: current, resolved: current !== url }
  }
  return { url: current, resolved: current !== url }
}

const UNITS: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }

/** "5.5 GB" -> bytes. */
export function parseSize(text: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)/i.exec(text)
  if (!m) return undefined
  return Math.round(Number(m[1]!.replace(',', '.')) * UNITS[m[2]!.toUpperCase()]!)
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '?'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
