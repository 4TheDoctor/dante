import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { parseConfig, resolvePath } from '../src/config.js'
import { envNameFor, resolveSecret } from '../src/secrets.js'
import { Dante, matchesEpisode } from '../src/service.js'
import { renderConfig } from '../src/setup.js'
import type { Candidate } from '../src/types.js'
import { mockFetch } from './helpers.js'

const cand = (name: string, extra: Partial<Candidate> = {}): Candidate => ({ id: name, engine: 't', name, languages: [], multiAudio: false, cache: {}, ...extra })

describe('matchesEpisode', () => {
  const ep = { type: 'series' as const, imdbId: 'tt1', season: 3, episode: 6 }
  it.each([
    ['Show.S03E06.1080p.mkv', true],
    ['Show.S03E07.1080p.mkv', false],
    ['Show.S02E06.1080p.mkv', false],
    ['Show.S03E01-10.1080p', true],
    ['Show.S03.1080p.WEB-DL', true],
    ['Show.S04.1080p.WEB-DL', false],
    ['Show 3x06 1080p', true],
    ['Show [HDTV 1080p][Cap.306]', true],
    ['Show [HDTV 1080p][Cap.307]', false],
  ])('%s', (name, expected) => {
    expect(matchesEpisode(cand(name), ep)).toBe(expected)
  })
})

describe('paths', () => {
  it('expands ~, keeps absolute paths and puts relative ones in the Dante folder', () => {
    expect(resolvePath('~/Movies/BDMV', '/h/Dante')).toBe(join(homedir(), 'Movies/BDMV'))
    expect(resolvePath('/abs/lib', '/h/Dante')).toBe('/abs/lib')
    expect(resolvePath('library', '/h/Dante')).toBe('/h/Dante/library')
  })
})

describe('config', () => {
  it('fills defaults and rejects bad values with the field name', () => {
    const c = parseConfig('')
    expect(c.preferences.resolutions).toEqual(['2160p', '1080p'])
    expect(c.play.port).toBe(7879)
    expect(() => parseConfig('[preferences]\nresolutions = ["8k"]')).toThrow(/preferences\.resolutions/)
  })

  it('setup writes a file that parses back, with no secret in it', () => {
    const text = renderConfig({
      languages: ['spa'],
      engines: ['\n[[engines]]\nname = "jackett"\ntype = "torznab"\nurl = "http://localhost:9117/api"\napi_key = "keychain:dante.jackett"\n'],
      debrid: ['alldebrid = "keychain:dante.alldebrid"'],
    })
    const c = parseConfig(text)
    expect(c.preferences.languages).toEqual(['spa'])
    expect(c.engines[0]).toMatchObject({ type: 'torznab', api_key: 'keychain:dante.jackett' })
    expect(c.debrid.alldebrid).toBe('keychain:dante.alldebrid')
  })
})

describe('secrets', () => {
  it('reads env: references and falls back from keychain: to DANTE_* variables', async () => {
    process.env.DANTE_TEST_ONLY_KEY = 'from-env'
    expect(await resolveSecret('env:DANTE_TEST_ONLY_KEY')).toBe('from-env')
    expect(envNameFor('dante.test-only.key')).toBe('DANTE_TEST_ONLY_KEY')
    expect(await resolveSecret('keychain:dante.test-only.key')).toBe('from-env')
    delete process.env.DANTE_TEST_ONLY_KEY
  })
})

describe('Dante service', () => {
  const TORZNAB = (items: string[]) =>
    `<rss><channel>${items.map((t, i) => `<item><title>${t}</title><size>${(i + 2) * 1e9}</size><torznab:attr name="infohash" value="${String(i).repeat(40).slice(0, 40)}"/></item>`).join('')}</channel></rss>`

  function make(items: string[], extraRoutes: Parameters<typeof mockFetch>[0] = []) {
    const { fetch, calls } = mockFetch([['GET', /torznab/, () => ({ text: TORZNAB(items) })], ...extraRoutes])
    const config = parseConfig(`
[preferences]
languages = ["spa"]
[[engines]]
name = "jackett"
type = "torznab"
url = "http://localhost:9117/api/v2.0/indexers/all/results/torznab/api"
api_key = "env:X"
[debrid]
alldebrid = "env:Y"
`)
    const dir = mkdtempSync(join(tmpdir(), 'dante-'))
    const dante = new Dante(config, { fetchImpl: fetch, resolve: async ref => (ref ? 'k' : undefined), statePath: join(dir, 'state.json') })
    return { dante, calls }
  }

  it('searches, keeps the episode, ranks, and plans a dub when the best video lacks the language', async () => {
    const { dante } = make([
      'Example.Show.S03E06.MULTI.2160p.DV.HDR10Plus.DemonAngeX.mkv',
      'Example.Show.S03E07.MULTI.2160p.DV.HDR10Plus.DemonAngeX.mkv',
      'Example Show [HDTV 1080p][Cap.306] Castellano',
    ])
    const r = await dante.search({ type: 'series', imdbId: 'tt1', title: 'Example Show', season: 3, episode: 6 })
    const names = r.ranked.map(x => x.candidate.name)
    expect(names).not.toContain('Example.Show.S03E07.MULTI.2160p.DV.HDR10Plus.DemonAngeX.mkv')
    expect(names[0]).toContain('S03E06.MULTI.2160p')
    expect(r.dub?.audio.candidate.name).toContain('Castellano')
    expect(r.dub?.command).toContain('--dub-lang spa')
  })

  it('reports a failing engine without failing the search, and adds to the debrid on request', async () => {
    const { dante, calls } = make(['Movie.2024.1080p.WEB-DL.Castellano.mkv'], [
      ['POST', /magnet\/upload/, () => ({ json: { status: 'success', data: { magnets: [{ id: 5, hash: '0'.repeat(40), name: 'Movie', ready: true }] } } })],
    ])
    const r = await dante.search({ type: 'movie', imdbId: 'tt2', title: 'Movie', year: 2024 })
    expect(r.errors).toEqual([])
    const t = await dante.add(r.ranked[0]!.candidate.id)
    expect(t).toMatchObject({ service: 'alldebrid', id: '5', ready: true })
    expect(dante.transfers()).toHaveLength(1)
    expect(calls.some(c => c.url.includes('magnet/upload'))).toBe(true)
  })

  it('remembers which episode each result is of, whatever was searched for afterwards', async () => {
    const titles = ['Example.Show.S01E01.1080p.WEB-DL.Castellano.mkv']
    const { dante } = make(titles, [])
    const show = { type: 'series' as const, imdbId: 'tt4', title: 'Example Show', season: 1 }
    const first = (await dante.search({ ...show, episode: 1 })).ranked[0]!.candidate
    titles[0] = 'Example.Show.S01E02.1080p.WEB-DL.Castellano.mkv'
    const second = (await dante.search({ ...show, episode: 2 })).ranked[0]!.candidate
    expect(dante.mediaOf(first.id)).toMatchObject({ imdbId: 'tt4', season: 1, episode: 1 })
    expect(dante.mediaOf(second.id)).toMatchObject({ imdbId: 'tt4', season: 1, episode: 2 })
    expect(() => dante.mediaOf('nothing')).toThrow(/search first/)
  })

  it('never takes one film for another, and adds nothing to get a link', async () => {
    const titles = ['First.Film.2024.1080p.WEB-DL.Castellano.mkv']
    const { dante, calls } = make(titles, [
      ['POST', /magnet\/upload/, () => ({ json: { status: 'success', data: { magnets: [{ id: 5, hash: '0'.repeat(40), name: 'First Film', ready: true }] } } })],
    ])
    const first = (await dante.search({ type: 'movie', imdbId: 'tt2', title: 'First Film', year: 2024 })).ranked[0]!.candidate
    await dante.add(first.id)
    titles[0] = 'Second.Film.2024.1080p.WEB-DL.Castellano.mkv'
    const second = (await dante.search({ type: 'movie', imdbId: 'tt3', title: 'Second Film', year: 2024 })).ranked[0]!.candidate
    expect(second.id).not.toBe(first.id)
    expect(dante.candidate(first.id).candidate.name).toContain('First')
    second.infoHash = 'f'.repeat(40)
    const uploads = () => calls.filter(c => c.url.includes('magnet/upload')).length
    expect(uploads()).toBe(1)
    await expect(dante.links(second.id)).rejects.toThrow(/add_to_debrid first/)
    await expect(dante.links(second.id, undefined, true)).rejects.toThrow(/not known to be cached/)
    expect(uploads()).toBe(1)
  })
})
