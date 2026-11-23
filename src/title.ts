import { getJson, type Fetch } from './http.js'
import type { MediaType } from './types.js'

/** Stremio's public metadata addon: search by name, no key. */
const CINEMETA = 'https://v3-cinemeta.strem.io'

export interface TitleMatch {
  imdbId: string
  type: MediaType
  name: string
  year?: number
  /** "2011–2019" for series. */
  releaseInfo?: string
}

interface Meta {
  id: string
  type: string
  name: string
  releaseInfo?: string
}

function yearOf(info?: string): number | undefined {
  const m = /(\d{4})/.exec(info ?? '')
  return m ? Number(m[1]) : undefined
}

/** Look a title up by name. Without `type`, both films and series are searched. */
export async function findTitle(query: string, type?: MediaType, fetchImpl?: Fetch): Promise<TitleMatch[]> {
  const imdb = /\btt\d{7,9}\b/.exec(query)
  const types: MediaType[] = type ? [type] : ['movie', 'series']
  const lists = await Promise.all(
    types.map(async t => {
      if (imdb) {
        const body = await getJson<{ meta?: Meta }>(`${CINEMETA}/meta/${t}/${imdb[0]}.json`, { fetchImpl }).catch(() => ({ meta: undefined }))
        return body.meta ? [body.meta] : []
      }
      const body = await getJson<{ metas?: Meta[] }>(
        `${CINEMETA}/catalog/${t}/top/search=${encodeURIComponent(query.trim())}.json`,
        { fetchImpl },
      ).catch(() => ({ metas: [] as Meta[] }))
      return (body.metas ?? []).slice(0, 6)
    }),
  )
  const out: TitleMatch[] = []
  // Interleave so the best film and the best series both appear near the top.
  for (let i = 0; i < 6; i++) {
    for (const list of lists) {
      const m = list[i]
      if (m && /^tt\d+$/.test(m.id) && !out.some(o => o.imdbId === m.id)) {
        out.push({ imdbId: m.id, type: m.type === 'series' ? 'series' : 'movie', name: m.name, year: yearOf(m.releaseInfo), releaseInfo: m.releaseInfo })
      }
    }
  }
  return out
}
