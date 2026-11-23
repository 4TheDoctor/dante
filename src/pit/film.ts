// Which film a request is about, out of those the session came across: the one its title names.
// Only IMDb ids are looked up; what the request says never leaves the computer.
export interface Film {
  id: string
  /** Empty when only the id was seen. */
  name: string
}

/** What the mod says: the film being searched for, and all that were seen, the latest last. */
export interface Ask {
  title: string
  current: string | null
  seen: readonly Film[]
  /** The title comes from the same search as `current`; a task list is titled freely. */
  isSearch: boolean
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Whether a title names a film, as whole words. */
export const isAbout = (title: string, name: string): boolean => fold(name) !== '' && ` ${fold(title)} `.includes(` ${fold(name)} `)

/** What is left of a title once the logo says the film's name: "S03E06". */
export function captionOf(title: string, name: string): string {
  const wanted = fold(name)
  const words = title.trim().split(/\s+/)
  for (let n = words.length; n > 0 && wanted !== ''; n--) if (fold(words.slice(0, n).join(' ')) === wanted) return words.slice(n).join(' ')
  return title
}

/** The film, and what to write under its logo. */
export async function chooseFilm(ask: Ask, nameOf: (id: string) => Promise<string>): Promise<{ id: string; caption: string } | undefined> {
  // A search can lack a title and still be about a film: playing one more episode after the first.
  if (ask.title === '' && !(ask.isSearch && ask.current !== null)) return undefined
  const named = await Promise.all([...ask.seen].reverse().map(async film => ({ id: film.id, name: film.name || (await nameOf(film.id).catch(() => '')) })))
  const current = named.find(film => film.id === ask.current) ?? (ask.current === null ? undefined : { id: ask.current, name: await nameOf(ask.current).catch(() => '') })
  // "Dune: Part Two" names "Dune" too: the longest name is the one meant.
  const told = named.filter(film => isAbout(ask.title, film.name)).sort((a, b) => fold(b.name).length - fold(a.name).length)[0]
  const film = ask.isSearch ? (current ?? told) : (told ?? current)
  return film === undefined ? undefined : { id: film.id, caption: captionOf(ask.title, film.name) }
}
