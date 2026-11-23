import { languageName } from './languages.js'
import type { Preferences, Ranked } from './types.js'

export interface DubPlan {
  video: Ranked
  audio: Ranked
  language: string
  /** Original language of the video, for audio4films --vo-lang. */
  originalLanguage: string
  /** Runs after both links are known: replace the two placeholders with get_links results. */
  command: string
  explanation: string
}

function sameEpisode(a: Ranked, b: Ranked): boolean {
  const x = a.info
  const y = b.info
  if (x.season === undefined && y.season === undefined) return true
  if (x.season !== y.season) return false
  if (x.episode === undefined || y.episode === undefined) return true
  return x.episode === y.episode
}

/** The language a release was made in, as far as the search tells. */
export function originalLanguageOf(r: Ranked, wanted: string[]): string {
  return [...r.languages, ...r.mentioned].find(l => !wanted.includes(l)) ?? 'eng'
}

/**
 * When the best video lacks the wanted audio and another release has it, plan to put that audio
 * onto the better video with audio4films (github.com/4TheDoctor/audio4films). It measures the
 * offset, refuses unsafe syncs and muxes without re-encoding the video.
 */
export function planDub(ranked: Ranked[], prefs: Preferences): DubPlan | undefined {
  const video = ranked[0]
  if (!video || !video.missingLanguage || !prefs.dubFallback || !prefs.languages.length) return undefined
  for (const language of prefs.languages) {
    const audio = ranked.find(r => r !== video && r.languages.includes(language) && sameEpisode(r, video))
    if (!audio) continue
    const originalLanguage = originalLanguageOf(video, prefs.languages)
    // audio4films tags Latin American Spanish as Spanish too.
    const dubLang = language === 'lat' ? 'spa' : language
    return {
      video,
      audio,
      language,
      originalLanguage,
      command: `audio4films run "<VIDEO_URL>" "<AUDIO_URL>" --vo-lang ${originalLanguage} --dub-lang ${dubLang}`,
      explanation:
        `The best video (${video.candidate.name}) has no confirmed ${languageName(language)} audio. ` +
        `${audio.candidate.name} has it. audio4films can copy that audio onto the better video, in sync, ` +
        `without re-encoding the video. It needs direct links for both: run get_links on ${video.candidate.id} and ${audio.candidate.id}.`,
    }
  }
  return undefined
}
