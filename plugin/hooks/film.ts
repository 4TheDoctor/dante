// Which films a session has come across, for the logo on the screen at the end. Pure. The helper
// that draws the pit (src/pit/film.ts) tells which of them a request is about.
import type { Film, Films } from '../types'

export const NO_FILMS: Films = { seen: [], current: null }
const SEEN_MOST = 12
/** How much of a tool's answer is looked through. */
const LOOK_MOST = 100_000

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const isId = (value: unknown): value is string => typeof value === 'string' && /^tt\d{5,10}$/.test(value)

/** The film a call is about. A search by name counts only when its answer leaves no doubt. */
export function filmOf(tool: string, input: unknown, answer: string): Film | undefined {
  const f = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  if (tool === 'search_streams' && isId(f.imdb_id)) return { id: f.imdb_id, name: typeof f.title === 'string' ? f.title : '' }
  if (tool === 'progress' && isId(f.imdb_id)) return { id: f.imdb_id, name: '' }
  if (tool !== 'find_title') return undefined
  const found = [...answer.matchAll(/^\d+\. (.+) \([^()]*\) · \w+ · (tt\d+)/gm)].map(m => ({ name: m[1]!, id: m[2]! }))
  const same = found.filter(one => fold(one.name) === fold(typeof f.query === 'string' ? f.query : ''))
  const sure = found.length === 1 ? found : same
  return sure.length === 1 ? { id: sure[0]!.id, name: sure[0]!.name } : undefined
}

/** The IMDb ids in a text, such as a command that opens a film in Stremio. */
export const idsIn = (text: string): string[] => [...new Set(text.slice(0, LOOK_MOST).match(/\btt\d{7,9}\b/g) ?? [])]

/** One more film, the latest last. A name already known is kept. */
export function withFilm(films: Films, film: Film): Films {
  const known = films.seen.find(one => one.id === film.id)
  const name = film.name || (known?.name ?? '')
  if (known !== undefined && known.name === name && films.seen.at(-1) === known) return films
  return { ...films, seen: [...films.seen.filter(one => one !== known), { id: film.id, name }].slice(-SEEN_MOST) }
}

/** What a call of Dante's says about the film the request is about. */
export function afterCall(films: Films, tool: string, input: unknown, answer: string, isNewList: boolean): Films {
  const film = filmOf(tool, input, answer)
  if (film !== undefined) return { ...withFilm(films, film), current: film.id }
  // Another request, or a search that does not say which: not the film of before.
  return (tool === 'find_title' || isNewList) && films.current !== null ? { ...films, current: null } : films
}
