import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dante's own Stremio addon: whatever Dante picked for a title shows up in Stremio (on the TV too)
 * as a "Dante" source. Links are the debrid's direct URLs, so the computer only answers small JSON
 * requests; it does not stream the video.
 */
export interface Pick {
  /** tt1234567 or tt1234567:3:6 */
  stremioId: string
  type: 'movie' | 'series'
  url: string
  title: string
  filename?: string
  size?: number
  addedAt: string
}

export const MANIFEST = {
  id: 'community.dante',
  version: '0.1.0',
  name: 'Dante',
  description: 'What Dante picked for you, from your own debrid account.',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
}

export class PickRegistry {
  constructor(private readonly path: string) {}

  all(): Pick[] {
    try {
      return (JSON.parse(readFileSync(this.path, 'utf8')) as { picks: Pick[] }).picks ?? []
    } catch {
      return []
    }
  }

  add(pick: Pick): void {
    const picks = [...this.all().filter(p => !(p.stremioId === pick.stremioId && p.url === pick.url)), pick].slice(-200)
    mkdirSync(join(this.path, '..'), { recursive: true })
    writeFileSync(this.path, `${JSON.stringify({ picks }, null, 2)}\n`)
  }

  forId(stremioId: string): Pick[] {
    return this.all().filter(p => p.stremioId === stremioId).reverse()
  }
}

export function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return '127.0.0.1'
}

export function makeAddonServer(registry: PickRegistry): Server {
  return createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!)
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
    }
    if (path === '/manifest.json') return json(200, MANIFEST)
    const m = /^\/stream\/(movie|series)\/(.+)\.json$/.exec(path)
    if (m) {
      const streams = registry.forId(m[2]!).map(p => ({
        name: 'Dante',
        description: `${p.title}${p.filename ? `\n${p.filename}` : ''}`,
        url: p.url,
        behaviorHints: { notWebReady: true, filename: p.filename, videoSize: p.size, bingeGroup: 'dante' },
      }))
      return json(200, { streams })
    }
    json(404, { error: 'not found' })
  })
}
