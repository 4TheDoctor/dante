import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { afterCall, filmOf, idsIn, NO_FILMS, withFilm } from '../plugin/hooks/film'
import { captionOf, chooseFilm, isAbout } from '../src/pit/film.js'
import { decodePng, fetchLogo, isImdbId, pixelLogo, type Picture } from '../src/pit/logo.js'
import { LOGO, LOGO_COLORS, PLTE, SPOT } from '../src/pit/palette.js'
import { encodePng } from '../src/pit/png.js'
import { Pit, type Goal } from '../src/pit/scene.js'

type Paint = (x: number, y: number) => [number, number, number, number]
const picture = (w: number, h: number, paint: Paint): Picture => {
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(paint(x, y), (y * w + x) * 4)
  return { w, h, rgba }
}
/** A PNG of RGBA pixels, each row written with another of the five filters. */
const png = ({ w, h, rgba }: Picture): Buffer => {
  const chunk = (name: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(name, 4, 'latin1')
    data.copy(out, 8)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head.set([8, 6, 0, 0, 0], 8)
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  const at = (x: number, y: number): number => (x < 0 || y < 0 ? 0 : rgba[y * stride + x]!)
  for (let y = 0; y < h; y++) {
    const filter = y % 5
    raw[y * (stride + 1)] = filter
    for (let i = 0; i < stride; i++) {
      const [a, b, c] = [at(i - 4, y), at(i, y - 1), at(i - 4, y - 1)]
      const p = a + b - c
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      raw[y * (stride + 1) + 1 + i] = at(i, y) - [0, a, b, (a + b) >> 1, paeth][filter]!
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const bars = (r: number, g: number, b: number): Picture => picture(200, 80, (x, y) => (x > 20 && x < 180 && y > 20 && y < 60 && x % 20 < 12 ? [r, g, b, 255] : [0, 0, 0, 0]))

describe('reading a logo', () => {
  it('decodes every row filter', () => {
    const made = picture(23, 17, (x, y) => [(x * 11) & 255, (y * 15) & 255, (x * y) & 255, (x + y) % 3 === 0 ? 0 : 255])
    const read = decodePng(png(made))
    expect([read.w, read.h]).toEqual([23, 17])
    expect([...read.rgba]).toEqual([...made.rgba])
  })

  it('decodes a palette with a see-through colour', () => {
    const read = decodePng(encodePng(Uint8Array.from([SPOT.void, SPOT.coif, SPOT.robe, SPOT.void]), 2, 2, 1, 2, 2, SPOT.void))
    expect([...read.rgba.subarray(4, 8)]).toEqual([0xf3, 0xe7, 0xd3, 255])
    expect(read.rgba[3]).toBe(0)
  })

  it('refuses what is not a PNG it can read', () => {
    expect(() => decodePng(Buffer.from('<html>not here</html>'.repeat(4)))).toThrow('not a PNG')
    const cut = png(bars(255, 0, 0))
    expect(() => decodePng(cut.subarray(0, 60))).toThrow()
    const huge = png(bars(255, 0, 0))
    huge.writeUInt32BE(50_000, 16)
    expect(() => decodePng(huge)).toThrow('another size')
  })
})

describe('redrawing a logo in pixel art', () => {
  it('fits the box, drops the empty margin and keeps to a few colours', () => {
    const logo = pixelLogo(picture(400, 200, (x, y) => (x >= 100 && x < 300 && y >= 80 && y < 120 ? [x & 255, 40, y & 255, 255] : [9, 9, 9, 0])), 150, 60)!
    expect([logo.w, logo.h]).toEqual([150, 30])
    expect(logo.colors.length).toBeLessThanOrEqual(LOGO_COLORS)
    expect(Math.max(...logo.px)).toBeLessThanOrEqual(logo.colors.length)
    expect(Math.min(...logo.px)).toBeGreaterThan(0)
  })

  it('shows light logos on a dark screen and dark ones on the bright one', () => {
    expect(pixelLogo(bars(255, 255, 255), 150, 60)!.isLight).toBe(true)
    expect(pixelLogo(bars(255, 210, 90), 150, 60)!.isLight).toBe(true)
    expect(pixelLogo(bars(190, 20, 15), 150, 60)!.isLight).toBe(false)
    expect(pixelLogo(bars(10, 10, 10), 150, 60)!.isLight).toBe(false)
  })

  it('says no to an empty picture', () => {
    expect(pixelLogo(picture(50, 50, () => [255, 255, 255, 0]), 150, 60)).toBeUndefined()
  })

  it('burns it in on the screen at the end, and goes back to letters without one', () => {
    const pit = new Pit(249, 405)
    pit.labels = { circles: [], title: 'Example', caption: 'S01E02', facts: [], lit: [], now: -1 }
    const goal: Goal = { depth: 8, mood: 'done', isDone: true }
    pit.place(8)
    for (let n = 0; n < 900 && !pit.isSettled(goal); n++) pit.frame(goal, 0.1)
    const seen = (): number => {
      let most = 0
      for (let n = 0; n < 180; n++) {
        const px = pit.frame(goal, 0.1)
        expect(Math.max(...px)).toBeLessThan(PLTE.length / 3)
        most = Math.max(most, px.filter(c => c >= LOGO && c < LOGO + LOGO_COLORS).length)
      }
      return most
    }
    expect(seen()).toBe(0)
    pit.show(bars(190, 20, 15))
    expect(seen()).toBeGreaterThan(500)
    pit.show(undefined)
    expect(seen()).toBe(0)
  }, 20_000)
})

describe('fetching a logo', () => {
  const file = png(bars(190, 20, 15))
  const answer = (status: number, body: Buffer = file) => async (): Promise<Response> => new Response(new Uint8Array(body), { status })

  it('asks once and keeps the file', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'dante-logo-')), 'logos')
    const asked: string[] = []
    const fetchImpl = async (url: unknown): Promise<Response> => {
      asked.push(String(url))
      return answer(200)()
    }
    expect((await fetchLogo('tt0000001', dir, fetchImpl as typeof fetch))?.equals(file)).toBe(true)
    expect((await fetchLogo('tt0000001', dir, fetchImpl as typeof fetch))?.equals(file)).toBe(true)
    expect(asked).toEqual(['https://images.metahub.space/logo/medium/tt0000001/img'])
  })

  it('has none where there is none, and keeps nothing it cannot read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dante-logo-'))
    expect(await fetchLogo('tt0000002', dir, answer(404) as typeof fetch)).toBeUndefined()
    await expect(fetchLogo('tt0000003', dir, answer(200, Buffer.from('x'.repeat(99))) as typeof fetch)).rejects.toThrow('not a PNG')
    expect(existsSync(join(dir, 'tt0000003.png'))).toBe(false)
  })

  it('never asks for what is not an IMDb id', async () => {
    const never = async (): Promise<Response> => {
      throw new Error('asked')
    }
    for (const id of ['../../etc/passwd', 'tt', 'tt12/../x', 'nm0000001']) {
      expect(isImdbId(id)).toBe(false)
      expect(await fetchLogo(id, undefined, never as typeof fetch)).toBeUndefined()
    }
  })
})

describe('which film a request is about', () => {
  it('takes it from the search, or from a lookup that leaves no doubt', () => {
    expect(filmOf('search_streams', { imdb_id: 'tt0000009', title: 'Example Show', season: 3 }, '')).toEqual({ id: 'tt0000009', name: 'Example Show' })
    expect(filmOf('progress', { title: 'x', imdb_id: 'tt0000009' }, '')).toEqual({ id: 'tt0000009', name: '' })
    expect(filmOf('progress', { title: 'x' }, '')).toBeUndefined()
    const two = '1. Example (1999) · movie · tt0000001\n2. Example Two (2004) · movie · tt0000002 · by Somebody'
    expect(filmOf('find_title', { query: 'example' }, two)).toEqual({ id: 'tt0000001', name: 'Example' })
    expect(filmOf('find_title', { query: 'exam' }, two)).toBeUndefined()
    expect(filmOf('find_title', { query: 'example' }, two.replace('Example Two', 'Example'))).toBeUndefined()
    expect(filmOf('find_title', { query: 'the one' }, '1. Example (2011–2019) · series · tt0000003')).toEqual({ id: 'tt0000003', name: 'Example' })
  })

  it('picks up ids from any call, the latest last, and keeps the names it knows', () => {
    expect(idsIn('am start -d stremio:///detail/series/tt16358384/tt16358384:3:8 att1234567 tt12')).toEqual(['tt16358384'])
    let films = withFilm(withFilm(NO_FILMS, { id: 'tt0000001', name: 'One' }), { id: 'tt0000002', name: '' })
    films = withFilm(films, { id: 'tt0000001', name: '' })
    expect(films.seen).toEqual([{ id: 'tt0000002', name: '' }, { id: 'tt0000001', name: 'One' }])
    expect(withFilm(films, { id: 'tt0000001', name: 'One' })).toBe(films)
    for (let n = 0; n < 40; n++) films = withFilm(films, { id: `tt00001${n + 10}`, name: '' })
    expect(films.seen).toHaveLength(12)
  })

  it('remembers the film of a request through the next one, but not as its own', () => {
    const searched = afterCall(NO_FILMS, 'search_streams', { imdb_id: 'tt0000001', title: 'Example' }, '', false)
    expect(searched.current).toBe('tt0000001')
    expect(afterCall(searched, 'progress', { title: 'Example on the TV' }, '', false).current).toBe('tt0000001')
    const other = afterCall(searched, 'progress', { title: 'Tidy up' }, '', true)
    expect(other).toEqual({ seen: [{ id: 'tt0000001', name: 'Example' }], current: null })
    expect(afterCall(searched, 'find_title', { query: 'x' }, '1. A (1999) · movie · tt0000003\n2. B (1999) · movie · tt0000004', false).current).toBeNull()
  })

  it('shows the film a title names, looking up by id only the ones without a name', async () => {
    const asked: string[] = []
    const nameOf = async (id: string): Promise<string> => {
      asked.push(id)
      return { tt0000002: 'Dune', tt0000003: 'Dune: Part Two' }[id] ?? ''
    }
    const seen = [{ id: 'tt0000001', name: 'Example Show' }, { id: 'tt0000002', name: '' }, { id: 'tt0000003', name: '' }]
    const ask = { current: null, seen, isSearch: false }
    expect(await chooseFilm({ ...ask, title: 'Example Show E08–E10 dubbed' }, nameOf)).toEqual({ id: 'tt0000001', caption: 'E08–E10 dubbed' })
    expect(asked.sort()).toEqual(['tt0000002', 'tt0000003'])
    expect(await chooseFilm({ ...ask, title: 'Dune Part Two on the TV' }, nameOf)).toEqual({ id: 'tt0000003', caption: 'on the TV' })
    expect(await chooseFilm({ ...ask, title: 'Tidy up' }, nameOf)).toBeUndefined()
    expect(await chooseFilm({ ...ask, title: '' }, nameOf)).toBeUndefined()
  })

  it('takes the film searched for when the title says it in another language', async () => {
    const nameOf = async (): Promise<string> => {
      throw new Error('no network')
    }
    const seen = [{ id: 'tt0000001', name: 'The Example' }]
    expect(await chooseFilm({ title: 'El ejemplo en la tele', current: 'tt0000001', seen, isSearch: false }, nameOf)).toEqual({ id: 'tt0000001', caption: 'El ejemplo en la tele' })
    expect(await chooseFilm({ title: 'x', current: 'tt0000002', seen: [], isSearch: true }, nameOf)).toEqual({ id: 'tt0000002', caption: 'x' })
  })

  it('knows whether a title names a film, and what is left to say under the logo', () => {
    const name = 'Amélie: The Show'
    expect(isAbout('amelie the show on the TV', name)).toBe(true)
    expect(isAbout('Tidy up the downloads', name)).toBe(false)
    expect(isAbout('Showing', 'Show')).toBe(false)
    expect(captionOf('Amélie: The Show S03E07', name)).toBe('S03E07')
    expect(captionOf('Amélie The Show on the TV', name)).toBe('on the TV')
    expect(captionOf('Amélie: The Show', name)).toBe('')
    expect(captionOf('Put it on', '')).toBe('Put it on')
  })
})
