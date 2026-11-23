import { SPOT, type SpotName } from './palette.js'

const KEY: Record<string, SpotName> = {
  K: 'outline', R: 'robe', r: 'robeDark', H: 'robeLight', W: 'coif', S: 'skin', s: 'skinShade',
  L: 'laurel', l: 'laurelDark', G: 'laurelGold', T: 'toga', t: 'togaShade', d: 'togaDark', h: 'hair',
  B: 'boot', O: 'soul', o: 'soulDim', E: 'eye', V: 'void', Y: 'eyeYellow', x: 'hide', X: 'hideLight', f: 'fur',
  F: 'furLight', c: 'cloak', C: 'cloakLight', q: 'scale', Q: 'scaleLight', n: 'demon', N: 'demonLight', k: 'bone',
  j: 'boneDark', u: 'hull', U: 'hullLight', M: 'metal', m: 'metalDark', p: 'metalLight', g: 'green', e: 'greenDark',
  D: 'led', i: 'blue', b: 'blueDark', I: 'screen', y: 'amber', z: 'amberDark', a: 'red', v: 'violet',
}

export type Sprite = readonly string[]

/** Rows of one width. */
const art = (...rows: string[]): Sprite => {
  const width = Math.max(...rows.map(row => row.length))
  return rows.map(row => row.padEnd(width, '.'))
}

/** Facing right. The last rows are the feet, which change with each step. */
const DANTE_BODY: Sprite = [
  '....KKKKK...',
  '...KLGLGLK..',
  '..KGLGlGLGK.',
  '..KRRRRRRRK.',
  '.KRRHRRRWWK.',
  '.KRHRRRWSSSK',
  '.KRRRRWSSKSK',
  '.KRRRRWSSSSS',
  '.KrRRRWSSSSK',
  '.KrRRRRWSsK.',
  '..KrRRRKKK..',
  '..KRRRRRRK..',
  '.KRRHRRRRRK.',
  '.KRHRRRrRRRK',
  '.KRRRRRrRSSK',
  '.KRRRRRrRRK.',
  '.KRRRRRrRRK.',
  '.KrRRRRrRRK.',
  '.KrRRRrRRRK.',
  '.KrRRRrRRRK.',
]
/** The guide: a small robot with a laurel of its own. */
const VIRGIL_BODY: Sprite = [
  '.....KDK....',
  '.....KpK....',
  '...KLlLlLK..',
  '..KLpppplLK.',
  '..KppppppMK.',
  '..KpKKKKKKK.',
  '..KpKIIKIIK.',
  '..KpKKKKKKK.',
  '..KppppppMK.',
  '...KMMMMMK..',
  '....KmmK....',
  '..KKppppKK..',
  '.KppppppppK.',
  '.KpMppppMpK.',
  '.KpMpiipMppK',
  '.KpMpiipMKpK',
  '.KpMppppMKKK',
  '..KMppppMK..',
  '..KMMMMMMK..',
  '..KmmmmmmK..',
]
const FEET: readonly Sprite[] = [
  ['..KBBKKBBK..', '..KKK..KKK..'],
  ['.KBBK..KBBK.', '.KKK....KKK.'],
  ['..KBBKKBBK..', '...KKK.KKK..'],
  ['...KBBBBK...', '...KKKKKK...'],
]

export const DANTE: readonly Sprite[] = FEET.map(feet => [...DANTE_BODY, ...feet])
export const VIRGIL: readonly Sprite[] = FEET.map(feet => [...VIRGIL_BODY, ...feet.map(row => row.replaceAll('B', 'm'))])

/** What the storm carries: magnets and torrents. */
export const MAGNET: Sprite = art('.KKKKKKK.', 'KRRRRRRRK', 'KRRKKKRRK', 'KRRK.KRRK', 'KrRK.KrRK', 'KWWK.KWWK', 'KWWK.KWWK', '.KK...KK.')
export const FILE: Sprite = art('KKKKKK..', 'KWWWWTK.', 'KWWgWWTK', 'KWWgWWWK', 'KWgggWWK', 'KWWgWWWK', 'KWWWWWWK', 'KKKKKKKK')
export const REEL: Sprite = art('..KKKKK..', '.KMMMMMK.', 'KMMKMKMMK', 'KMKMMMKMK', 'KMMMKMMMK', 'KMKMMMKMK', 'KMMKMKMMK', '.KMMMMMK.', '..KKKKK..')
/** Given, and taken: the arrows of every torrent client. */
export const UP: Sprite = art('......K......', '.....KgK.....', '....KgDgK....', '...KgDDgeK...', '..KgDDDggeK..', '.KgDDDDgggeK.', 'KKKKKgDgeKKKK', '....KgDgeK...', '....KgDgeK...', '....KgDgeK...', '....KgggeK...', '....KKKKKK...')
export const DOWN: Sprite = art('....KKKKKK...', '....KaaarK...', '....KaHarK...', '....KaHarK...', '....KaHarK...', 'KKKKKaHarKKKK', '.KaHHHHaaarK.', '..KaHHHaarK..', '...KaHHarK...', '....KaHrK....', '.....KaK.....', '......K......')
export const CRATE: Sprite = art('KKKKKKKKKKK', 'KyyyyyyyyyK', 'KyzzzzzzzyK', 'KyzyzzzyzyK', 'KyzzyzyzzyK', 'KyzzzyzzzyK', 'KyzzyzyzzyK', 'KyzyzzzyzyK', 'KyyyyyyyyyK', 'KKKKKKKKKKK')
/** Here lies a file. */
export const TOMB: Sprite = art('...KKKKK...', '.KKMMMMMKK.', 'KMMMKKKMMMK', 'KMMKMMMKMMK', 'KMKMMKKMKMK', 'KMKMKMMMKMK', 'KMKMMKKMKMK', 'KMMKMMMKMMK', 'KMMMKKKMMMK', 'KMMMMMMMMMK', 'KmMMMMMMMmK', 'KmmmmmmmmmK')
export const CAR: Sprite = art('.......VVVVVVVV...........', '.....VVbbVbbbbVVV.........', '....VVbbbVbbbbbVVVV.......', 'VVVVVVVVVVVVVVVVVVVVVVVVV.', 'VaVVVVVVVVVVVVVVVVVVVVVVyV', 'VVVVmmmVVVVVVVVVVmmmVVVVVV', '...mKKKm........mKKKm.....', '....mmm..........mmm......')
export const POPCORN: Sprite = art('.W.WyW.W.', 'WyWWWyWWW', '.WWyWWWy.', 'aWaWaWaWa', 'aWaWaWaWa', '.WaWaWaW.', '.aWaWaWa.', '.aWaWaWa.')

/** Shut in the rock: a floppy disk, a compact disc, a cassette. 1 raised, 2 sunk. */
export const FOSSILS: readonly Sprite[] = [
  art('1111111', '1122211', '1122211', '1111111', '1222221', '1222221', '1111111'),
  art('..111..', '.11111.', '1112111', '1122211', '1112111', '.11111.', '..111..'),
  art('1111111111', '1222222221', '1111111111', '1121111211', '1121111211', '1111111111'),
]

/** Charon, and Phlegyas after him: an old man in a cloak. */
export const FERRYMAN: Sprite = art(
  '....ccc....',
  '...cCCCc...',
  '..cCCSSc...',
  '..cCSSKS...',
  '..cCCWWS...',
  '..cCWWWc...',
  '.cCCCWCCc..',
  '.cCCCCCCcSS',
  'cCCcCCCCCSS',
  'cCCcCCCCcc.',
  'cCCcCCcCCc.',
  'cCCcCCcCCc.',
  'cCCcCCcCCc.',
  'cCCCCCcCCc.',
  'cCCCCCCCCc.',
)

export interface Canvas {
  w: number
  h: number
  px: Uint8Array
}

/** Draw a sprite with its feet at (x, foot), x its middle. */
export function stamp({ w, h, px }: Canvas, art: Sprite, x: number, foot: number, facesRight = true): void {
  const top = foot - art.length + 1
  for (let j = 0; j < art.length; j++) {
    const row = art[j]!
    const Y = top + j
    if (Y < 0 || Y >= h) continue
    const left = x - (row.length >> 1)
    for (let i = 0; i < row.length; i++) {
      const spot = KEY[row[facesRight ? i : row.length - 1 - i]!]
      const X = left + i
      if (spot !== undefined && X >= 0 && X < w) px[Y * w + X] = SPOT[spot]
    }
  }
}

// A pixel alphabet, five rows high: what is cut in the rock. Most letters are three wide; M, N and W need more.
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '1000111011101011000110001', N: '10011101101110011001', O: '111101101101111',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '%': '101001010100101', '/': '001001010100100', ':': '000010000010000', '.': '000000000000010',
  '-': '000000111000000', '&': '010101010101011', "'": '010010000000000', '!': '010010010000010', '?': '110001010000010',
}

const BIG: Record<string, string> = {
  D: '11110100011000110001100011000111110', A: '01110100011000111111100011000110001',
  N: '10001110011010110011100011000110001', T: '11111001000010000100001000010000100',
  E: '11111100001000011110100001000011111',
  B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110',
  G: '01110100011000010111100011000101110',
  I: '01110001000010000100001000010001110',
  K: '10001100101010011000101001001010001',
  O: '01110100011000110001100011000101110',
  R: '11110100011000111110101001001010001',
  V: '10001100011000110001100010101000100',
  '&': '01100100101010001000101011001001101',
}

/** Capitals without accents, as the alphabet has them. */
export const capitals = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9%/:.\-&'!? ]/g, ' ').replace(/ +/g, ' ').trim()

const widthOf = (letter: string): number => (GLYPHS[letter]?.length ?? 15) / 5

export const textWidth = (text: string): number => [...text].reduce((sum, letter) => sum + widthOf(letter) + 1, -1)

/** Write text with its top left corner at (x, y). Returns where the next letter would go. */
export function write({ w, h, px }: Canvas, text: string, x: number, y: number, color: number): number {
  let at = x
  for (const letter of text) {
    const glyph = GLYPHS[letter] ?? ''
    const wide = widthOf(letter)
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] !== '1') continue
      const X = at + (i % wide)
      const Y = y + Math.floor(i / wide)
      if (X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
    }
    at += wide + 1
  }
  return at
}

/** A letter of the name, 5 x 7. */
export function writeBig({ w, h, px }: Canvas, letter: string, x: number, y: number, color: number): void {
  const glyph = BIG[letter] ?? ''
  for (let i = 0; i < glyph.length; i++) {
    const X = x + (i % 5)
    const Y = y + Math.floor(i / 5)
    if (glyph[i] === '1' && X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
  }
}

/** Break text into at most `most` lines of `room` pixels; what does not fit ends in dots. */
export function wrap(text: string, room: number, most: number): string[] {
  const cut = (line: string, end = ''): string => {
    let kept = line
    while (kept !== '' && textWidth(kept + end) > room) kept = kept.slice(0, -1)
    return kept.trimEnd() + (kept === line && end === '' ? '' : end)
  }
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && textWidth(`${last} ${word}`) <= room) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  const kept = lines.slice(0, most).map(line => (textWidth(line) > room ? cut(line, '..') : line))
  if (lines.length > most) kept[most - 1] = cut(kept[most - 1]!, '..')
  return kept
}
