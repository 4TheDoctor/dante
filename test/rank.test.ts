import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseConfig, toPreferences } from '../src/config.js'
import { streamToCandidate, type StremioStream } from '../src/engines/stremio-addon.js'
import { mergeInfo, parseRelease, rank } from '../src/rank.js'
import type { Candidate, Preferences } from '../src/types.js'

describe('parseRelease', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'Example.Show.S03E06.MULTI.2160p.HDR.DV.HDR10Plus.DemonAngeX.mkv',
      { resolution: '2160p', hdr: ['DV', 'HDR10+'], multi: true, season: 3, episode: 6 },
    ],
    [
      'Example.Show.S03E06.Pilot.2160p.AMZN.WEB-DL.DDP5.1.H.265-G66.mkv',
      { resolution: '2160p', source: 'WEB-DL', codec: 'HEVC', audio: ['DD+'], channels: '5.1', group: 'G66' },
    ],
    ['Example Show [HDTV 1080p][Cap.306]', { resolution: '1080p', source: 'HDTV', season: 3, episode: 6 }],
    ['Example Show [HDTV 720p][Cap.1012]', { season: 10, episode: 12 }],
    ['Example.Show.S03E06.WEB-DLRip.RGzsRutracker.avi', { source: 'WEBRip' }],
    [
      'Example Show 3x06 Pilot 1080p WEB-DL H265 Ita Eng AC3 5.1 Sub Ita Eng iDN_CreW',
      { season: 3, episode: 6, languages: ['eng', 'ita'], audio: ['DD'], channels: '5.1' },
    ],
    ['Example.Show.S03E01-10.1080p.AMZN.WEB-DL.DDP5.1.H.264-G66', { season: 3, pack: true, codec: 'AVC' }],
    ['Example.Show.S03.1080p.10bit.WEBRip.6CH.x265.HEVC-PSA', { season: 3, pack: true, channels: '5.1', source: 'WEBRip' }],
    [
      'Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.TrueHD.Atmos.7.1-FGT',
      { source: 'REMUX', hdr: ['DV'], audio: ['Atmos', 'TrueHD'], channels: '7.1', group: 'FGT' },
    ],
    ['Dune Part Two 2024 COMPLETE UHD BLURAY-SURCODE', { source: 'BDMV', resolution: '2160p' }],
    ['The.Spanish.Prisoner.1997.1080p.BluRay.x264-GRP', { languages: [], source: 'BluRay' }],
    ['Oppenheimer.2023.1080p.BluRay.x264.Dual.Castellano.Ingles', { languages: ['spa', 'eng'], dual: true }],
    ['Movie.2023.HDCAM.x264', { source: 'CAM' }],
    ['Example Show S03E06 NORDiC 1080p SKST WEB-DL H 264 DDP5 1-DKV', { languages: ['dan', 'fin', 'nor', 'swe'], audio: ['DD+'], channels: '5.1' }],
    ['Example.Show.S03E06.WEB-DLRip.HDRezka.JuSSiKa.avi', { hdr: [] }],
  ]
  it.each(cases)('%s', (name, expected) => {
    const info = parseRelease(name) as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(expected)) {
      if (Array.isArray(value)) expect([...(info[key] as string[])].sort(), key).toEqual([...value].sort())
      else expect(info[key], key).toEqual(value)
    }
  })
})

describe('mergeInfo', () => {
  it('fills what the file name leaves out from the folder', () => {
    const merged = mergeInfo(
      parseRelease('Pelicula 4Kremux2160.www.example.mkv'),
      parseRelease('Pelicula [4K UHDremux 2160p][HDR10][Castellano AC3 2.0-Ingles AC3 2.0+Subs][ES-EN]'),
    )
    expect(merged).toMatchObject({ resolution: '2160p', source: 'REMUX', hdr: ['HDR10'], channels: '2.0' })
    expect(merged.languages).toEqual(expect.arrayContaining(['spa', 'eng']))
  })
})

const PREFS: Preferences = {
  resolutions: ['2160p', '1080p'],
  hdr: ['DV', 'HDR10+', 'HDR10'],
  languages: ['spa'],
  dubFallback: true,
  preferFullDisc: false,
  avoid: ['CAM'],
}

function fixtureCandidates(): Candidate[] {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/torrentio-series.json', import.meta.url), 'utf8')) as {
    streams: StremioStream[]
  }
  return raw.streams.flatMap((s, i) => streamToCandidate(s, 'torrentio', i) ?? [])
}

describe('Spanish of Spain and of America', () => {
  const langs = (name: string, engine: string[] = []): string[] =>
    rank([{ id: 'x', engine: 't', name, languages: engine, multiAudio: false, cache: {} }], { ...toPreferences(parseConfig('')), languages: ['spa'] })[0]!.languages.sort()

  it.each([
    ['Film (2026) 2160p Remux HDR HEVC DTS-HD.MA.5.1 Español Latino [X].mkv', ['spa', 'lat'], ['lat']],
    ['Film.2026.1080p.BluRay.LATINO-X.mkv', ['eng', 'lat'], ['eng', 'lat']],
    ['Film 2026 1080p Spanish Latino.mkv', ['spa'], ['lat']],
    ['Film 2026 1080p Castellano Latino Ingles.mkv', ['spa', 'lat'], ['eng', 'lat', 'spa']],
    ['Film (2026) 2160p English French Spanish.mkv', ['eng', 'spa', 'fre'], ['eng', 'fre', 'spa']],
    ['Film.2026.2160p.MULTi.mkv', ['lat', 'spa'], ['lat', 'spa']],
  ])('%s', (name, engine, expected) => {
    expect(langs(name, engine)).toEqual(expected)
  })
})

describe('rank on a real (anonymised) Torrentio answer', () => {
  it('reads flags, size, seeders and the file name from Torrentio streams', () => {
    const first = fixtureCandidates()[0]!
    expect(first.name).toBe('Example.Show.S03E06.MULTI.2160p.HDR.DV.HDR10Plus.DemonAngeX.mkv')
    expect(first.folder).toBe('Example.Show.S03.MULTI.2160p.HDR.DV.HDR10Plus.DemonAngeX')
    expect(first.languages).toEqual(['eng'])
    expect(first.multiAudio).toBe(true)
    expect(first.seeders).toBe(7)
    expect(first.size).toBeGreaterThan(5.4 * 1024 ** 3)
    expect(first.source).toBe('1337x')
  })

  it('puts the 4K Dolby Vision video first and marks that Castilian is not confirmed', () => {
    const ranked = rank(fixtureCandidates(), PREFS)
    expect(ranked[0]!.candidate.name).toContain('DemonAngeX')
    expect(ranked[0]!.missingLanguage).toBe(true)
    expect(ranked[0]!.reasons.join(' | ')).toContain('DV')
  })

  it('without the dub fallback, a release with Castilian audio wins', () => {
    const ranked = rank(fixtureCandidates(), { ...PREFS, dubFallback: false })
    expect(ranked[0]!.languages).toContain('spa')
    expect(ranked[0]!.missingLanguage).toBe(false)
  })

  it('drops avoided words and merges the same file reported twice', () => {
    const c = (name: string, extra: Partial<Candidate> = {}): Candidate => ({
      id: name,
      engine: 'x',
      name,
      languages: [],
      multiAudio: false,
      cache: {},
      ...extra,
    })
    const ranked = rank(
      [
        c('Movie.2023.HDCAM.x264'),
        c('Movie.2023.1080p.WEB-DL.mkv', { infoHash: 'AB', fileIdx: 0, cache: { realdebrid: true } }),
        c('Movie.2023.1080p.WEB-DL.mkv', { infoHash: 'ab', fileIdx: 0, cache: { alldebrid: false } }),
      ],
      PREFS,
    )
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.candidate.cache).toEqual({ realdebrid: true, alldebrid: false })
  })
})
