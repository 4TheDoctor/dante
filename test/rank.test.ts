import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseConfig, toPreferences } from '../src/config.js'
import { planDub } from '../src/dub.js'
import { streamToCandidate, type StremioStream } from '../src/engines/stremio-addon.js'
import { audioText } from '../src/format.js'
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

describe('what proves audio in a language', () => {
  const named = (name: string) => {
    const { languages, mentioned } = parseRelease(name)
    return { audio: [...languages].sort(), mentioned: [...mentioned].sort() }
  }

  it.each([
    ['Film [BluRay 1080p][AC3 5.1 Castellano DTS 5.1-Ingles+Subs][ES-EN]', ['eng', 'spa']],
    ['Film (2024) [WEB-DL 1080p X265 10bits][Castellano EAC3 5.1-Ingles AC3 5.1][Subs].mkv', ['eng', 'spa']],
    ['Film [BluRay 1080p][Castellano][Subs]', ['spa']],
    ['Film (2026) [4k 2160p][Esp].mkv', ['spa']],
    ['Film.2024.Eng.Fre.Spa.2160p.BluRay.Remux.HEVC.Atmos-GRP.mkv', ['eng', 'fre', 'spa']],
    ['Film.2024.FRENCH.1080p.BluRay.x264-GRP.mkv', ['fre']],
    ['Film (2026) 2160p REMUX Dual Audio [Hindi + English] ESub.mkv', ['eng', 'hin']],
  ])('audio: %s', (name, audio) => {
    expect(named(name)).toEqual({ audio, mentioned: [] })
  })

  it.each([
    ['Film (2026) (2160p UHD BluRay x265 10bit DV HDR10 DTS-HD MA 5.1 English French Spanish GRP) [QxR]', [], ['eng', 'fre', 'spa']],
    ['Film (2026) (2160p UHD BluRay x265 10bit HDR DTS-HD MA 5.1 English + French + Spanish GRP) [QxR]', [], ['eng', 'fre', 'spa']],
    ['Film.2023.SPANiSH.1080p.BluRay.x264-GRP.mkv', [], ['spa']],
    ['Film.(IMAX).(2026).(Spanish.English.Subs).BDRip.1080p.x264-DTS.EAC3.mkv', [], ['eng', 'spa']],
    ['Film [2026 BDRip 1080p] MVO + Dub + Original Eng + Sub (Rus Eng Fra Spa)', ['eng'], ['fre', 'rus', 'spa']],
    ['Film [2026 HDRip-AVC] MVO + Dub + Sub Rus Eng Fra Esp + Original Eng', ['eng'], ['fre', 'rus', 'spa']],
    ['Film.2026.1080p.WEB-DL.Subs.Castellano.mkv', [], ['spa']],
    ['Film.2026.1080p.WEB-DL.Esp.Subs.mkv', [], ['spa']],
    ['Example Show - Temporada 5 [HDTV][Cap.508][V.O. Subt. Castellano].avi', [], ['spa']],
    ['Example.Show.S05E08.HDTV.720.Subtitulado.Esp.SC.avi', [], ['spa']],
  ])('not proved: %s', (name, audio, mentioned) => {
    expect(named(name)).toEqual({ audio, mentioned })
  })

  // Shaped like a real release: ffprobe finds English audio only, and Spanish among the subtitles.
  const subtitled = streamToCandidate(
    {
      title: [
        'Film (2026) (2160p UHD BluRay x265 10bit DV HDR10 DTS-HD MA 5.1 English French Spanish GRP) [QxR]',
        'Film (2026) (2160p UHD BluRay x265 10bit DV HDR10+ GRP).mkv',
        '👤 851 💾 24.26 GB ⚙️ 1337x',
        '🇬🇧 / 🇪🇸 / 🇫🇷',
      ].join('\n'),
      behaviorHints: { filename: 'Film (2026) (2160p UHD BluRay x265 10bit DV HDR10+ GRP).mkv' },
    },
    'torrentio',
    3,
  )!
  const dubbed: Candidate = { id: 'd', engine: 't', name: 'Film (2026) [BluRay 1080p][AC3 5.1 Castellano]', languages: ['spa'], multiAudio: false, cache: {} }

  it('does not call it Castilian audio, in the points, in the text or in the result', () => {
    const r = rank([subtitled], PREFS)[0]!
    expect(r.languages).not.toContain('spa')
    expect(r.mentioned).toContain('spa')
    expect(r.missingLanguage).toBe(true)
    expect(r.reasons).not.toContainEqual(expect.stringContaining('audio in Castilian Spanish'))
    expect(r.reasons).toContainEqual('+0 Castilian Spanish is mentioned, maybe only as subtitles')
    expect(audioText(r)).toBe('audio language not stated; mentioned, maybe only as subtitles: Castilian Spanish, English, French')
  })

  it('does not take the flag alone for audio, even when the engine says multi audio', () => {
    const r = rank([{ ...subtitled, name: 'Film.2026.2160p.MULTi.mkv', folder: undefined, multiAudio: true }], PREFS)[0]!
    expect(r.missingLanguage).toBe(true)
    expect(r.reasons).toContainEqual('+5 multi audio, Castilian Spanish not confirmed')
  })

  it('ranks proved above mentioned, and mentioned above nothing, when the language decides', () => {
    const c = (id: string, name: string, languages: string[]): Candidate => ({ ...dubbed, id, name, languages })
    const ranked = rank(
      [c('none', 'Film.2026.1080p.A.mkv', []), c('flag', 'Film.2026.1080p.B.mkv', ['spa']), c('audio', 'Film.2026.1080p.Castellano.mkv', [])],
      { ...PREFS, dubFallback: false },
    )
    expect(ranked.map(r => r.candidate.id)).toEqual(['audio', 'flag', 'none'])
  })

  it.each([
    ['Wolfmax4k', 'Example Show [HDTV 1080p][Cap.306].mkv', ['spa'], []],
    ['MejorTorrent', 'Example Show [HDTV][Cap.306].avi', ['spa'], []],
    ['MejorTorrent', 'Example Show [HDTV][Cap.508][V.O. Subt. Castellano].avi', [], ['spa']],
    ['MejorTorrent', 'Example Show [HDTV][Cap.508][VOSE].avi', [], ['spa']],
    ['1337x', 'Example Show [HDTV 1080p][Cap.306].mkv', [], ['spa']],
    [undefined, 'Example Show [HDTV 1080p][Cap.306].mkv', [], ['spa']],
  ])('the Spanish flag of %s on %s', (source, name, audio, mentioned) => {
    const r = rank([{ ...dubbed, name, source, languages: ['spa'] }], PREFS)[0]!
    expect({ audio: r.languages, mentioned: r.mentioned }).toEqual({ audio, mentioned })
  })

  it('takes the dub from a release that proves it, and keeps the original language the flags give', () => {
    const japanese = { ...subtitled, id: 'j', languages: ['spa', 'jpn'], folder: undefined }
    const decoy = { ...subtitled, id: 'decoy', name: 'Film.2026.2160p.Spanish.mkv', folder: undefined }
    const plan = planDub(rank([japanese, decoy, dubbed], PREFS), PREFS)
    expect(plan?.audio.candidate.id).toBe('d')
    expect(plan?.originalLanguage).toBe('jpn')
    expect(planDub(rank([japanese, decoy], PREFS), PREFS)).toBeUndefined()
  })
})

describe('Spanish of Spain and of America', () => {
  // Which Spanish it is, whether it is proved as audio or only mentioned.
  const langs = (name: string, engine: string[] = []): string[] => {
    const r = rank([{ id: 'x', engine: 't', name, languages: engine, multiAudio: false, cache: {} }], { ...toPreferences(parseConfig('')), languages: ['spa'] })[0]!
    return [...r.languages, ...r.mentioned].sort()
  }

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
