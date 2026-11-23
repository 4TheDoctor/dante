import { describe, expect, it } from 'vitest'
import { findTitle } from '../src/title.js'
import { aioToCandidate, AioStreamsEngine, type AioResult } from '../src/engines/aiostreams.js'
import { cacheFromName, StremioAddonEngine, streamPath } from '../src/engines/stremio-addon.js'
import { parseTorznab, torznabQueries, TorznabEngine } from '../src/engines/torznab.js'
import { languagesFromFlags } from '../src/languages.js'
import { mockFetch } from './helpers.js'

describe('Stremio addons', () => {
  it('reads cache markers the way Torrentio and Comet print them', () => {
    expect(cacheFromName('[RD+] Torrentio\n4k')).toEqual({ realdebrid: true })
    expect(cacheFromName('[RD download] Torrentio\n4k')).toEqual({ realdebrid: false })
    expect(cacheFromName('[AD⚡] Comet 2160P')).toEqual({ alldebrid: true })
    expect(cacheFromName('[TB⬇️] Comet 1080P')).toEqual({ torbox: false })
    expect(cacheFromName('Torrentio\n4k')).toEqual({})
  })

  it('reads languages from flag emoji', () => {
    expect(languagesFromFlags('Multi Audio / 🇬🇧 / 🇵🇱')).toEqual(['eng', 'pol'])
    expect(languagesFromFlags('🇪🇸')).toEqual(['spa'])
    expect(languagesFromFlags('🇲🇽 🇪🇸')).toEqual(['lat', 'spa'])
  })

  it('asks for the episode with the season and episode in the id', async () => {
    expect(streamPath({ type: 'series', imdbId: 'tt123', season: 3, episode: 6 })).toBe('/stream/series/tt123%3A3%3A6.json')
    const { fetch, calls } = mockFetch([
      ['GET', /\/stream\/movie\/tt9\.json$/, () => ({
        json: { streams: [{ name: '[RD+] Torrentio\n4k', title: 'Movie.2024.2160p.WEB-DL.mkv\n👤 12 💾 9.1 GB ⚙️ 1337x\n🇪🇸', url: 'https://torrentio.example/resolve/x' }] },
      })],
    ])
    const engine = new StremioAddonEngine('torrentio', 'https://torrentio.example/CONFIGWITHKEY123456/manifest.json', fetch)
    const [c] = await engine.search({ type: 'movie', imdbId: 'tt9' })
    expect(calls[0]!.url).toBe('https://torrentio.example/CONFIGWITHKEY123456/stream/movie/tt9.json')
    expect(c).toMatchObject({ name: 'Movie.2024.2160p.WEB-DL.mkv', seeders: 12, languages: ['spa'], cache: { realdebrid: true } })
    expect(engine.describe()).not.toContain('CONFIGWITHKEY')
  })
})

const TORZNAB = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel>
<item><title>Example Show S03E06 1080p WEB-DL DDP5.1 H.264 &amp; Friends</title>
<size>1900000000</size><link>http://localhost:9117/dl/x</link>
<jackettindexer id="1337x">1337x</jackettindexer>
<torznab:attr name="seeders" value="106"/><torznab:attr name="infohash" value="ABCDEF0123456789ABCDEF0123456789ABCDEF01"/></item>
<item><title><![CDATA[Example Show [HDTV 1080p][Cap.306]]]></title><size>2410000000</size>
<torznab:attr name="magneturl" value="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&amp;dn=x"/></item>
</channel></rss>`

describe('Torznab', () => {
  it('parses items, entities, CDATA, info hashes from attrs or magnets', () => {
    const [a, b] = parseTorznab(TORZNAB, 'jackett')
    expect(a).toMatchObject({ name: 'Example Show S03E06 1080p WEB-DL DDP5.1 H.264 & Friends', seeders: 106, source: '1337x', infoHash: 'abcdef0123456789abcdef0123456789abcdef01' })
    expect(b).toMatchObject({ name: 'Example Show [HDTV 1080p][Cap.306]', infoHash: '0123456789abcdef0123456789abcdef01234567' })
    expect(b!.magnet).toContain('&dn=x')
  })

  it('raises torznab errors and searches episode, then season pack', async () => {
    expect(() => parseTorznab('<error code="100" description="Invalid API Key"/>', 'jackett')).toThrow(/Invalid API Key/)
    expect(torznabQueries({ type: 'series', imdbId: 'tt1', title: "Example: Show's", season: 3, episode: 6 }).map(q => q.q)).toEqual([
      'Example Show s S03E06',
      'Example Show s S03',
    ])
    const { fetch, calls } = mockFetch([['GET', /torznab\/api/, () => ({ text: TORZNAB })]])
    const results = await new TorznabEngine('jackett', 'http://localhost:9117/api/v2.0/indexers/all/results/torznab/api', 'K', fetch).search({
      type: 'movie',
      imdbId: 'tt1',
      title: 'Example',
      year: 2024,
    })
    expect(results).toHaveLength(2)
    expect(calls[0]!.url).toContain('q=Example+2024')
    expect(calls[0]!.url).toContain('cat=2000')
  })
})

describe('AIOStreams', () => {
  const result: AioResult = {
    infoHash: 'ABC',
    fileIdx: 2,
    url: 'https://aio.example/playback/x',
    filename: 'Dune.Part.Two.2024.2160p.REMUX.mkv',
    folderName: 'Dune.Part.Two.2024.2160p.REMUX',
    size: 80_000_000_000,
    seeders: 40,
    indexer: 'TorrentGalaxy',
    addon: 'Comet',
    service: 'realdebrid',
    cached: true,
    parsedFile: { languages: ['English', 'Spanish', 'Latino'] },
  }
  it('maps results, languages and cache status', () => {
    expect(aioToCandidate(result, 'aio', 0)).toMatchObject({
      name: 'Dune.Part.Two.2024.2160p.REMUX.mkv',
      folder: 'Dune.Part.Two.2024.2160p.REMUX',
      infoHash: 'abc',
      languages: ['eng', 'spa', 'lat'],
      cache: { realdebrid: true },
    })
  })
  it('sends Basic auth and surfaces API errors', async () => {
    const { fetch, calls } = mockFetch([
      ['GET', /\/api\/v1\/search/, () => ({ json: { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid credentials' }, data: null } })],
    ])
    const engine = new AioStreamsEngine('aio', 'https://aio.example', 'uuid:pw', fetch)
    await expect(engine.search({ type: 'series', imdbId: 'tt5', season: 1, episode: 2 })).rejects.toThrow(/Invalid credentials/)
    expect(calls[0]!.headers.authorization).toBe(`Basic ${Buffer.from('uuid:pw').toString('base64')}`)
    expect(calls[0]!.url).toContain('id=tt5%3A1%3A2')
  })
})

describe('titles', () => {
  it('says whose each one is when several share name and year, and asks nothing more otherwise', async () => {
    const meta = (id: string, name: string, year: string) => ({ id, type: 'movie', name, releaseInfo: year })
    const { fetch, calls } = mockFetch([
      ['GET', /catalog\/movie/, () => ({ json: { metas: [meta('tt1', 'Example', '2026'), meta('tt2', 'Example', '2026'), meta('tt3', 'Example', '1999')] } })],
      ['GET', /catalog\/series/, () => ({ json: { metas: [] } })],
      ['GET', /meta\/movie\/tt1/, () => ({ json: { meta: { ...meta('tt1', 'Example', '2026'), director: ['Ann Author'], cast: ['Bo Actor', 'Cy Actor'] } } })],
      ['GET', /meta\/movie\/tt2/, () => ({ json: { meta: { ...meta('tt2', 'Example', '2026'), director: null, cast: [] } } })],
    ])
    const found = await findTitle('example', undefined, fetch)
    expect(found.map(m => m.people)).toEqual(['by Ann Author, with Bo Actor, Cy Actor', 'no director or cast listed', undefined])
    expect(calls.filter(c => c.url.includes('/meta/'))).toHaveLength(2)
  })
})
