export type MediaType = 'movie' | 'series'

/** What the user asked for, resolved to an IMDb id. */
export interface MediaRef {
  type: MediaType
  imdbId: string
  season?: number
  episode?: number
  title?: string
  year?: number
}

export const DEBRID_SERVICES = [
  'alldebrid',
  'realdebrid',
  'torbox',
  'premiumize',
  'debridlink',
  'offcloud',
  'easydebrid',
  'pikpak',
] as const
export type DebridService = (typeof DEBRID_SERVICES)[number]

/** One playable option returned by an engine, before ranking. */
export interface Candidate {
  /** Stable within one search: `<engine>:<n>`. */
  id: string
  engine: string
  /** The file name when the engine knows it, otherwise the release name. */
  name: string
  /** Torrent or folder name when it differs from the file (season packs). */
  folder?: string
  infoHash?: string
  fileIdx?: number
  /** Magnet link, when the engine gives one instead of (or besides) an info hash. */
  magnet?: string
  /** A link the engine already resolved (debrid or proxy). */
  url?: string
  /** Bytes. */
  size?: number
  seeders?: number
  /** Indexer or tracker that reported it. */
  source?: string
  /** Audio languages the engine reported (codes from `languages.ts`). */
  languages: string[]
  /** The engine said "multi audio" without listing every language. */
  multiAudio: boolean
  /** Cache status per debrid service, only where it is known. */
  cache: Partial<Record<DebridService, boolean>>
}

export type Resolution = '2160p' | '1440p' | '1080p' | '720p' | '576p' | '480p'
export type HdrFormat = 'DV' | 'HDR10+' | 'HDR10' | 'HDR' | 'HLG'
export type SourceKind = 'BDMV' | 'REMUX' | 'BluRay' | 'WEB-DL' | 'WEBRip' | 'HDTV' | 'DVD' | 'CAM'
export type Codec = 'HEVC' | 'AVC' | 'AV1' | 'VC-1' | 'MPEG-2' | 'XviD'

/** What a release name says about itself. */
export interface ReleaseInfo {
  resolution?: Resolution
  hdr: HdrFormat[]
  source?: SourceKind
  codec?: Codec
  audio: string[]
  channels?: string
  languages: string[]
  multi: boolean
  dual: boolean
  group?: string
  season?: number
  episode?: number
  /** Covers more than one episode. */
  pack: boolean
  /** Things a viewer usually wants to avoid: 3D, sample, extras. */
  flags: string[]
}

export interface Preferences {
  /** Best first. Resolutions not listed are allowed but ranked below. */
  resolutions: Resolution[]
  /** Best first. */
  hdr: HdrFormat[]
  /** Audio languages wanted, best first. Empty means any. */
  languages: string[]
  /** Keep a better video that lacks the language and plan a dub for it (audio4films). */
  dubFallback: boolean
  /** Rank full Blu-ray discs (BDMV, with menus) first. */
  preferFullDisc: boolean
  minSizeGB?: number
  maxSizeGB?: number
  /** Release words that remove a result, e.g. CAM, 3D. */
  avoid: string[]
}

export interface Ranked {
  candidate: Candidate
  info: ReleaseInfo
  score: number
  /** Every point added or taken, in words, so the choice can be checked. */
  reasons: string[]
  /** Languages known to be in it: from the name and from the engine. */
  languages: string[]
  /** None of the wanted languages is known to be in it. */
  missingLanguage: boolean
}
