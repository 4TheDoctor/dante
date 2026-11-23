import { hasWord, languageName, languagesFromName } from './languages.js'
import type {
  Candidate,
  Codec,
  HdrFormat,
  Preferences,
  Ranked,
  ReleaseInfo,
  Resolution,
  SourceKind,
} from './types.js'

/** Lowercase, drop the extension, turn separators into spaces. Keeps `-` and `+`. */
export function spaced(name: string): string {
  const noExt = name.replace(/\.(mkv|mp4|avi|m2ts|ts|iso|wmv|mov|webm)$/i, '')
  return ` ${noExt.toLowerCase().replace(/[._[\](){}/\\|,~]+/g, ' ').replace(/\s+/g, ' ')} `
}

const W = (re: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re})(?![\\p{L}\\p{N}])`, 'u')

const RESOLUTIONS: Array<[RegExp, Resolution]> = [
  [W('2160p|4k|uhd|2160i'), '2160p'],
  [W('1440p'), '1440p'],
  [W('1080p|1080i|fhd'), '1080p'],
  [W('720p'), '720p'],
  [W('576p|576i'), '576p'],
  [W('480p|480i|sd'), '480p'],
]

const HDRS: Array<[RegExp, HdrFormat]> = [
  [W('dv|dovi|dolby ?vision|dolbyvision'), 'DV'],
  [/(?<![\p{L}\p{N}])hdr10(?:\+|plus|p)(?![\p{L}\p{N}])/u, 'HDR10+'],
  [W('hdr10'), 'HDR10'],
  [W('hdr'), 'HDR'],
  [W('hlg'), 'HLG'],
]

/** Checked in this order: the first match wins. */
const SOURCES: Array<[RegExp, SourceKind]> = [
  [W('bdmv|complete (?:uhd )?blu-?ray|full blu-?ray|bd25|bd50|bd66|bd100|uhd bd'), 'BDMV'],
  [W('remux|bdremux'), 'REMUX'],
  [W('cam|hdcam|camrip|ts|telesync|hdts|tc|telecine'), 'CAM'],
  [W('webrip|web-?dlrip|web-rip'), 'WEBRip'],
  [W('web-?dl|webdl|web|amzn|nf|dsnp|hmax|atvp|pmtp|sky'), 'WEB-DL'],
  [W('blu-?ray|bdrip|brrip|bd'), 'BluRay'],
  [W('hdtv|tvrip|pdtv'), 'HDTV'],
  [W('dvd|dvdrip|dvd5|dvd9'), 'DVD'],
]

const CODECS: Array<[RegExp, Codec]> = [
  [W('x265|h ?265|hevc'), 'HEVC'],
  [W('x264|h ?264|avc'), 'AVC'],
  [W('av1'), 'AV1'],
  [W('vc-?1'), 'VC-1'],
  [W('mpeg-?2'), 'MPEG-2'],
  [W('xvid|divx'), 'XviD'],
]

const AUDIO: Array<[RegExp, string]> = [
  [W('atmos'), 'Atmos'],
  [W('truehd'), 'TrueHD'],
  [W('dts-?x|dts x'), 'DTS:X'],
  [W('dts-?hd(?: ?ma)?|dts-hd ma|dtshd'), 'DTS-HD MA'],
  [W('dts'), 'DTS'],
  [/(?<![\p{L}\p{N}])(?:ddp|dd\+|eac3|e-ac-?3)(?=\d|[^\p{L}])/u, 'DD+'],
  [/(?<![\p{L}\p{N}])(?:dd|ac-?3)(?=\d|[^\p{L}\p{N}+])/u, 'DD'],
  [W('aac'), 'AAC'],
  [W('flac'), 'FLAC'],
  [W('opus'), 'Opus'],
  [W('lpcm|pcm'), 'PCM'],
]

/**
 * Where the tags start: the year, the episode marker, the resolution or the first bracket.
 * Languages are read only from there on, so a title like "The Spanish Prisoner" does not count
 * as Spanish audio.
 */
function tagRegion(name: string, s: string): string {
  const anchors = [
    /(?<![\p{N}])(?:19|20)\d\d(?![\p{N}])/u,
    /(?<![\p{L}\p{N}])s\d{1,2}(?:e\d{1,3})?(?![\p{L}])/u,
    /(?<![\p{N}])\d{1,2}x\d{2}(?![\p{N}])/u,
    /(?<![\p{L}\p{N}])(?:2160p|1080p|720p|480p|4k)(?![\p{L}\p{N}])/u,
  ]
  let start = s.length
  for (const re of anchors) {
    const m = re.exec(s)
    if (m && m.index < start) start = m.index
  }
  const bracket = name.indexOf('[')
  if (bracket > 0) {
    const before = spaced(name.slice(0, bracket)).trimEnd().length
    if (before < start) start = before
  }
  return start >= s.length ? s : ` ${s.slice(start)}`
}

function episodeOf(s: string): { season?: number; episode?: number; pack: boolean } {
  const range = /(?<![\p{L}\p{N}])s(\d{1,2})e(\d{1,3}) ?- ?(?:e?(\d{1,3}))(?![\p{N}])/u.exec(s)
  if (range) return { season: Number(range[1]), pack: true }
  const se = /(?<![\p{L}\p{N}])s(\d{1,2}) ?e(\d{1,3})(?![\p{N}])/u.exec(s)
  if (se) return { season: Number(se[1]), episode: Number(se[2]), pack: false }
  const x = /(?<![\p{N}])(\d{1,2})x(\d{2,3})(?![\p{N}])/u.exec(s)
  if (x) return { season: Number(x[1]), episode: Number(x[2]), pack: false }
  // Spanish releases: "Cap.306" = season 3, episode 06; "Cap.1012" = season 10, episode 12.
  const cap = /(?<![\p{L}\p{N}])cap ?(\d{3,4})(?![\p{N}])/u.exec(s)
  if (cap) {
    const n = cap[1]!
    return { season: Number(n.slice(0, n.length - 2)), episode: Number(n.slice(-2)), pack: false }
  }
  const season = /(?<![\p{L}\p{N}])(?:s(\d{1,2})|season (\d{1,2})|temporada (\d{1,2}))(?![\p{N}])/u.exec(s)
  if (season) return { season: Number(season[1] ?? season[2] ?? season[3]), pack: true }
  if (/(?<![\p{L}])(?:complete|completa|pack)(?![\p{L}])/u.test(s)) return { pack: true }
  return { pack: false }
}

/** Read what a release name says: resolution, HDR, source, codec, audio, languages, episode. */
export function parseRelease(name: string): ReleaseInfo {
  const s = spaced(name)
  const tags = tagRegion(name, s)
  const first = <T>(table: Array<[RegExp, T]>): T | undefined => table.find(([re]) => re.test(s))?.[1]

  const hdr: HdrFormat[] = []
  for (const [re, format] of HDRS) {
    if (re.test(s) && !hdr.includes(format)) hdr.push(format)
  }
  // "HDR" alone is implied when a specific format is named.
  if (hdr.length > 1 && hdr.includes('HDR')) hdr.splice(hdr.indexOf('HDR'), 1)

  const audio: string[] = []
  for (const [re, label] of AUDIO) {
    if (re.test(s) && !audio.includes(label)) audio.push(label)
  }
  if (audio.includes('DTS-HD MA') || audio.includes('DTS:X')) {
    const i = audio.indexOf('DTS')
    if (i >= 0) audio.splice(i, 1)
  }
  if (audio.includes('DD+')) {
    const i = audio.indexOf('DD')
    if (i >= 0) audio.splice(i, 1)
  }

  const channelMatch = /(?<![\p{N}])([2578])[ .]([01])(?![\p{N}])/u.exec(s) ?? /(?<![\p{N}])(6|8)ch(?![\p{L}])/u.exec(s)
  const channels = channelMatch
    ? channelMatch[2] !== undefined
      ? `${channelMatch[1]}.${channelMatch[2]}`
      : channelMatch[1] === '6'
        ? '5.1'
        : '7.1'
    : undefined

  const flags: string[] = []
  if (W('3d|hsbs|h-sbs|half-sbs').test(s)) flags.push('3D')
  if (W('sample').test(s)) flags.push('sample')
  if (W('extras|bonus|featurette').test(s)) flags.push('extras')

  const groupMatch = /-([A-Za-z0-9]+)(?:\.[a-z0-9]{2,4})?$/.exec(name.trim())
  const ep = episodeOf(s)

  return {
    resolution: first(RESOLUTIONS),
    hdr,
    source: first(SOURCES),
    codec: first(CODECS),
    audio,
    channels,
    languages: languagesFromName(tags),
    multi: hasWord(tags, 'multi') || hasWord(tags, 'multi audio'),
    dual: hasWord(tags, 'dual') || hasWord(tags, 'dual audio'),
    group: groupMatch?.[1],
    ...ep,
    flags,
  }
}

const GB = 1024 ** 3

/**
 * Score a candidate against the preferences. Every point comes with a reason in words, so the
 * user (or the model) can check why something ranked where it did.
 */
export function rankOne(candidate: Candidate, prefs: Preferences): Ranked | undefined {
  const info = parseRelease(candidate.name)
  const folderInfo = candidate.folder ? parseRelease(candidate.folder) : undefined
  const reasons: string[] = []
  let score = 0
  const add = (points: number, why: string) => {
    score += points
    reasons.push(`${points >= 0 ? '+' : ''}${points} ${why}`)
  }

  const s = spaced(`${candidate.name} ${candidate.folder ?? ''}`)
  const source = info.source ?? folderInfo?.source
  // An avoided word removes the result when it is in the name, or when it names the source
  // (CAM catches HDCAM and telesyncs) or a flag (3D).
  const kinds = [source, ...info.flags].filter(Boolean).map(k => k!.toLowerCase())
  for (const word of prefs.avoid) {
    const w = word.toLowerCase()
    if (hasWord(s, w) || kinds.includes(w)) return undefined
  }

  const resolution = info.resolution ?? folderInfo?.resolution
  if (resolution) {
    const i = prefs.resolutions.indexOf(resolution)
    if (i >= 0) add(40 - 10 * i, `${resolution} (preference ${i + 1} of ${prefs.resolutions.length})`)
    else add(-20, `${resolution} is not among the wanted resolutions`)
  } else {
    add(-10, 'resolution unknown')
  }

  const hdr = info.hdr.length ? info.hdr : (folderInfo?.hdr ?? [])
  const hdrRanks = hdr.map(h => prefs.hdr.indexOf(h)).filter(i => i >= 0)
  if (hdrRanks.length) {
    const best = Math.min(...hdrRanks)
    add(25 - 5 * best, `${prefs.hdr[best]}${hdr.length > 1 ? ` (also ${hdr.filter(h => h !== prefs.hdr[best]).join(', ')})` : ''}`)
  } else if (prefs.hdr.length && resolution === '2160p') {
    add(0, '4K without HDR')
  }

  const languages = [...new Set([...info.languages, ...(folderInfo?.languages ?? []), ...candidate.languages])]
  const multi = info.multi || info.dual || candidate.multiAudio || Boolean(folderInfo?.multi || folderInfo?.dual)
  let missingLanguage = false
  if (prefs.languages.length) {
    const i = prefs.languages.findIndex(l => languages.includes(l))
    // With dubFallback the video comes first and the audio can be added later (audio4films), so a
    // missing language costs little; without it the language decides.
    if (i >= 0) {
      add(30 - 5 * i, `audio in ${languageName(prefs.languages[i]!)}`)
    } else if (multi) {
      add(prefs.dubFallback ? 5 : -20, `multi audio, ${languageName(prefs.languages[0]!)} not confirmed`)
      missingLanguage = true
    } else {
      add(prefs.dubFallback ? -10 : -60, `no ${prefs.languages.map(languageName).join(' or ')} audio known`)
      missingLanguage = true
    }
  }

  const cachedOn = Object.entries(candidate.cache).filter(([, cached]) => cached).map(([service]) => service)
  if (cachedOn.length) add(20, `cached on ${cachedOn.join(', ')}`)
  else if (Object.values(candidate.cache).some(cached => cached === false)) add(-5, 'not cached yet')

  switch (source) {
    case 'BDMV':
      add(prefs.preferFullDisc ? 15 : -10, prefs.preferFullDisc ? 'full Blu-ray disc with menus' : 'full disc (needs a disc player)')
      break
    case 'REMUX':
      add(10, 'remux (untouched video and audio)')
      break
    case 'BluRay':
    case 'WEB-DL':
      add(5, source)
      break
    case 'HDTV':
    case 'DVD':
      add(-5, source)
      break
    case 'CAM':
      add(-100, 'camera or telesync copy')
      break
    default:
      break
  }

  if (info.audio.some(a => a === 'Atmos' || a === 'TrueHD' || a === 'DTS-HD MA' || a === 'DTS:X')) {
    add(5, info.audio.filter(a => ['Atmos', 'TrueHD', 'DTS-HD MA', 'DTS:X'].includes(a)).join(' '))
  }

  if (info.flags.includes('3D')) add(-40, '3D')
  if (info.flags.includes('sample')) add(-100, 'sample file')
  if (info.flags.includes('extras')) add(-60, 'extras, not the feature')

  if (candidate.size !== undefined) {
    const gb = candidate.size / GB
    if (prefs.maxSizeGB !== undefined && gb > prefs.maxSizeGB) add(-50, `${gb.toFixed(1)} GB is over ${prefs.maxSizeGB} GB`)
    if (prefs.minSizeGB !== undefined && gb < prefs.minSizeGB) add(-50, `${gb.toFixed(1)} GB is under ${prefs.minSizeGB} GB`)
  }

  if (candidate.seeders !== undefined && candidate.seeders > 0) {
    const points = Math.min(5, Math.round(Math.log10(candidate.seeders + 1) * 2))
    if (points > 0) add(points, `${candidate.seeders} seeders`)
  }

  return { candidate, info, score, reasons, languages, missingLanguage }
}

/** Rank, drop what the preferences exclude, and merge duplicates (same file reported twice). */
export function rank(candidates: Candidate[], prefs: Preferences): Ranked[] {
  const byKey = new Map<string, Ranked>()
  for (const candidate of candidates) {
    const ranked = rankOne(candidate, prefs)
    if (!ranked) continue
    const key = candidate.infoHash
      ? `${candidate.infoHash.toLowerCase()}:${candidate.fileIdx ?? ''}`
      : `${candidate.name.toLowerCase()}:${candidate.size ?? ''}`
    const existing = byKey.get(key)
    if (!existing || ranked.score > existing.score) {
      if (existing) ranked.candidate.cache = { ...existing.candidate.cache, ...ranked.candidate.cache }
      byKey.set(key, ranked)
    } else {
      existing.candidate.cache = { ...ranked.candidate.cache, ...existing.candidate.cache }
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score || (b.candidate.seeders ?? 0) - (a.candidate.seeders ?? 0))
}
