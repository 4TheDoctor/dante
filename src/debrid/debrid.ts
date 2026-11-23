import type { DebridService } from '../types.js'

export interface Transfer {
  id: string
  name?: string
  /** All files are available to unlock. */
  ready: boolean
  /** The service's own words, e.g. "Downloading 42%". */
  status: string
  progress?: number
}

export interface DebridFile {
  /** Path inside the torrent. */
  name: string
  size?: number
  /** Link to unlock into a direct URL (service-specific). */
  link: string
}

export interface DirectLink {
  url: string
  filename?: string
  size?: number
}

export interface Account {
  username?: string
  premium: boolean
  /** ISO date. */
  expires?: string
}

export interface DebridClient {
  readonly service: DebridService
  /**
   * Which hashes are cached right now. Some services have no read-only way to know: their
   * implementation adds the torrent, looks, and removes what it added (never what the user had).
   */
  checkCached(hashes: string[]): Promise<Record<string, boolean>>
  add(magnetOrHash: string): Promise<Transfer>
  status(id: string): Promise<Transfer>
  files(id: string): Promise<DebridFile[]>
  unlock(link: string): Promise<DirectLink>
  remove(id: string): Promise<void>
  account(): Promise<Account>
}

export function toMagnet(magnetOrHash: string): string {
  return magnetOrHash.startsWith('magnet:') ? magnetOrHash : `magnet:?xt=urn:btih:${magnetOrHash}`
}

const VIDEO = /\.(mkv|mp4|avi|m2ts|ts|wmv|mov|webm)$/i

/**
 * The file to play: the one whose name matches the release, else the largest video. For BDMV
 * folders there is no single file; callers use `prepare_bdmv` instead.
 */
export function pickFile(files: DebridFile[], wanted?: string): DebridFile | undefined {
  const base = (s: string) => s.split('/').pop()!.toLowerCase()
  if (wanted) {
    const w = base(wanted)
    const exact = files.find(f => base(f.name) === w)
    if (exact) return exact
  }
  const videos = files.filter(f => VIDEO.test(f.name) && !/sample/i.test(f.name))
  return (videos.length ? videos : files).reduce<DebridFile | undefined>(
    (best, f) => (best === undefined || (f.size ?? 0) > (best.size ?? 0) ? f : best),
    undefined,
  )
}
