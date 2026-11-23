import { formatSize } from './http.js'
import { languageName } from './languages.js'
import type { SearchResult } from './service.js'
import type { DebridService, Ranked } from './types.js'

const SHORT: Record<DebridService, string> = {
  alldebrid: 'AD',
  realdebrid: 'RD',
  torbox: 'TB',
  premiumize: 'PM',
  debridlink: 'DL',
  offcloud: 'OC',
  easydebrid: 'ED',
  pikpak: 'PP',
}

export function cacheText(r: Ranked): string {
  const entries = Object.entries(r.candidate.cache) as Array<[DebridService, boolean]>
  if (!entries.length) return 'cache unknown'
  return entries.map(([s, cached]) => `${SHORT[s]} ${cached ? 'cached' : 'not cached'}`).join(', ')
}

export function audioText(r: Ranked): string {
  const langs = r.languages.map(languageName)
  const multi = r.info.multi || r.info.dual || r.candidate.multiAudio
  const stated = langs.length
    ? `${langs.join(', ')}${multi ? ' (multi audio)' : ''}`
    : multi ? 'multi audio (languages not listed)' : 'audio language not stated'
  return r.mentioned.length ? `${stated}; mentioned, maybe only as subtitles: ${r.mentioned.map(languageName).join(', ')}` : stated
}

export function videoText(r: Ranked): string {
  const i = r.info
  return [i.resolution ?? '?', i.hdr.join(' ') || undefined, i.source, i.codec, i.audio.join(' ') || undefined, i.channels]
    .filter(Boolean)
    .join(' · ')
}

export function rankedLine(r: Ranked, n: number): string {
  const c = r.candidate
  return [
    `${n}. ${c.id}  score ${r.score}  ${c.name}`,
    `   ${videoText(r)} · ${formatSize(c.size)}${c.seeders !== undefined ? ` · ${c.seeders} seeders` : ''}${c.source ? ` · ${c.source}` : ''}`,
    `   audio: ${audioText(r)} · ${cacheText(r)}${c.folder ? ` · pack: ${c.folder}` : ''}`,
    `   why: ${r.reasons.join(' | ')}`,
  ].join('\n')
}

export function searchText(result: SearchResult, limit: number): string {
  const { media, ranked, errors, answered, dub } = result
  const what = media.type === 'series' && media.season !== undefined
    ? `${media.title ?? media.imdbId} S${String(media.season).padStart(2, '0')}${media.episode !== undefined ? `E${String(media.episode).padStart(2, '0')}` : ''}`
    : `${media.title ?? media.imdbId}${media.year ? ` (${media.year})` : ''}`
  const lines = [
    `${what}: ${ranked.length} results after ranking, from ${answered.map(a => `${a.engine} (${a.count})`).join(', ') || 'no engine'}.`,
  ]
  if (errors.length) lines.push(`Engines that failed: ${errors.join('; ')}`)
  if (!ranked.length) {
    lines.push('Nothing matched. Try another title spelling, another season pack, or check `doctor`.')
    return lines.join('\n')
  }
  lines.push('', ...ranked.slice(0, limit).map((r, i) => rankedLine(r, i + 1)))
  if (ranked.length > limit) lines.push('', `${ranked.length - limit} more not shown; ask with a higher limit to see them.`)
  if (dub) {
    lines.push('', `Dub option: ${dub.explanation}`, `Then: plan_dub with video_id ${dub.video.candidate.id} and audio_id ${dub.audio.candidate.id}.`)
  }
  return lines.join('\n')
}
