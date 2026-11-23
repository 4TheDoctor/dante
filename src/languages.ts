/**
 * Language codes Dante uses: ISO 639-2/B, plus `lat` for Latin American Spanish, which release
 * names and engines keep apart from Castilian (`spa`).
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  spa: 'Castilian Spanish',
  lat: 'Latin American Spanish',
  eng: 'English',
  fre: 'French',
  ger: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  ukr: 'Ukrainian',
  pol: 'Polish',
  cze: 'Czech',
  hun: 'Hungarian',
  rum: 'Romanian',
  gre: 'Greek',
  tur: 'Turkish',
  ara: 'Arabic',
  heb: 'Hebrew',
  hin: 'Hindi',
  tam: 'Tamil',
  tel: 'Telugu',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  tha: 'Thai',
  vie: 'Vietnamese',
  ind: 'Indonesian',
  dut: 'Dutch',
  dan: 'Danish',
  fin: 'Finnish',
  nor: 'Norwegian',
  swe: 'Swedish',
  cat: 'Catalan',
  baq: 'Basque',
  glg: 'Galician',
}

/** Words that name a language in release names and engine labels, lowercased. */
const WORDS: Record<string, string> = {
  castellano: 'spa',
  castellana: 'spa',
  spanish: 'spa',
  spa: 'spa',
  esp: 'spa',
  español: 'spa',
  espanol: 'spa',
  latino: 'lat',
  latam: 'lat',
  lat: 'lat',
  'latin american': 'lat',
  english: 'eng',
  eng: 'eng',
  ing: 'eng',
  ingles: 'eng',
  inglés: 'eng',
  french: 'fre',
  fre: 'fre',
  fra: 'fre',
  vff: 'fre',
  vfq: 'fre',
  truefrench: 'fre',
  german: 'ger',
  ger: 'ger',
  deu: 'ger',
  deutsch: 'ger',
  italian: 'ita',
  italiano: 'ita',
  ita: 'ita',
  portuguese: 'por',
  por: 'por',
  'pt-br': 'por',
  ptbr: 'por',
  russian: 'rus',
  rus: 'rus',
  ukrainian: 'ukr',
  ukr: 'ukr',
  polish: 'pol',
  pol: 'pol',
  pl: 'pol',
  czech: 'cze',
  cze: 'cze',
  hungarian: 'hun',
  hun: 'hun',
  romanian: 'rum',
  rum: 'rum',
  greek: 'gre',
  turkish: 'tur',
  tur: 'tur',
  arabic: 'ara',
  hebrew: 'heb',
  hindi: 'hin',
  hin: 'hin',
  tamil: 'tam',
  telugu: 'tel',
  japanese: 'jpn',
  jpn: 'jpn',
  jap: 'jpn',
  korean: 'kor',
  kor: 'kor',
  chinese: 'chi',
  chi: 'chi',
  mandarin: 'chi',
  cantonese: 'chi',
  thai: 'tha',
  vietnamese: 'vie',
  indonesian: 'ind',
  dutch: 'dut',
  dut: 'dut',
  nld: 'dut',
  danish: 'dan',
  dan: 'dan',
  finnish: 'fin',
  fin: 'fin',
  norwegian: 'nor',
  nor: 'nor',
  swedish: 'swe',
  swe: 'swe',
  catalan: 'cat',
  català: 'cat',
  basque: 'baq',
  euskera: 'baq',
  galician: 'glg',
  galego: 'glg',
}

/** Words that stand for several languages at once. */
const GROUPS: Record<string, string[]> = {
  nordic: ['dan', 'fin', 'nor', 'swe'],
}

/** Country of a flag emoji -> language. Only countries whose flag means one language. */
const FLAG_COUNTRIES: Record<string, string> = {
  ES: 'spa',
  MX: 'lat',
  AR: 'lat',
  CO: 'lat',
  CL: 'lat',
  GB: 'eng',
  US: 'eng',
  FR: 'fre',
  DE: 'ger',
  IT: 'ita',
  PT: 'por',
  BR: 'por',
  RU: 'rus',
  UA: 'ukr',
  PL: 'pol',
  CZ: 'cze',
  HU: 'hun',
  RO: 'rum',
  GR: 'gre',
  TR: 'tur',
  SA: 'ara',
  IL: 'heb',
  IN: 'hin',
  JP: 'jpn',
  KR: 'kor',
  CN: 'chi',
  TW: 'chi',
  HK: 'chi',
  TH: 'tha',
  VN: 'vie',
  ID: 'ind',
  NL: 'dut',
  DK: 'dan',
  FI: 'fin',
  NO: 'nor',
  SE: 'swe',
}

const REGIONAL_A = 0x1f1e6

/** Languages shown as flag emoji (🇪🇸 🇬🇧 …) in a text. */
export function languagesFromFlags(text: string): string[] {
  const found: string[] = []
  const chars = [...text]
  for (let i = 0; i + 1 < chars.length; i++) {
    const a = chars[i]!.codePointAt(0)!
    const b = chars[i + 1]!.codePointAt(0)!
    if (a >= REGIONAL_A && a < REGIONAL_A + 26 && b >= REGIONAL_A && b < REGIONAL_A + 26) {
      const country = String.fromCharCode(65 + a - REGIONAL_A, 65 + b - REGIONAL_A)
      const lang = FLAG_COUNTRIES[country]
      if (lang !== undefined && !found.includes(lang)) found.push(lang)
      i++
    }
  }
  return found
}

/** A language word or code (any case) -> Dante's code, or undefined. */
export function normLanguage(word: string): string | undefined {
  const w = word.trim().toLowerCase()
  if (w in LANGUAGE_NAMES) return w
  return WORDS[w]
}

/** Languages named in a release name, by whole words. */
export function languagesFromName(spaced: string): string[] {
  const found: string[] = []
  const add = (code: string) => {
    if (!found.includes(code)) found.push(code)
  }
  for (const [word, code] of Object.entries(WORDS)) {
    if (hasWord(spaced, word)) add(code)
  }
  for (const [word, codes] of Object.entries(GROUPS)) {
    if (hasWord(spaced, word)) codes.forEach(add)
  }
  return found
}

/** Whole-word, case-insensitive match on a name already lowercased and split into spaces. */
export function hasWord(spaced: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(spaced)
}

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code
}
