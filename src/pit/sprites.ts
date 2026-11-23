import { SPOT, type SpotName } from './palette.js'

const KEY: Record<string, SpotName> = {
  K: 'outline', R: 'robe', r: 'robeDark', H: 'robeLight', W: 'coif', S: 'skin', s: 'skinShade',
  L: 'laurel', l: 'laurelDark', G: 'laurelGold', T: 'toga', t: 'togaShade', d: 'togaDark', h: 'hair',
  B: 'boot', O: 'soul', o: 'soulDim', E: 'eye', V: 'void', Y: 'eyeYellow', x: 'hide', X: 'hideLight', f: 'fur',
  F: 'furLight', c: 'cloak', C: 'cloakLight', q: 'scale', Q: 'scaleLight', n: 'demon', N: 'demonLight', k: 'bone',
  j: 'boneDark', u: 'hull', U: 'hullLight',
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
const VIRGIL_BODY: Sprite = [
  '....KKKKK...',
  '...KLlLlLK..',
  '..KLlLLlLLK.',
  '..KhhhhSSSK.',
  '..KhhhSSSSK.',
  '..KhhSSSKSK.',
  '..KhhSSSSSSK',
  '..KKhSSSSSK.',
  '...KSsSSSK..',
  '...KKSSsK...',
  '..KTTTTTTK..',
  '.KTTTtTTTTK.',
  '.KTTtTTTtTK.',
  '.KTtTTTtTTTK',
  '.KTtTTtTTSSK',
  '.KTtTTtTTTK.',
  '.KTtTtTTTdK.',
  '.KdTtTtTTdK.',
  '.KdTtTtTTdK.',
  '.KdTTtTTTdK.',
]
const FEET: readonly Sprite[] = [
  ['..KBBKKBBK..', '..KKK..KKK..'],
  ['.KBBK..KBBK.', '.KKK....KKK.'],
  ['..KBBKKBBK..', '...KKK.KKK..'],
  ['...KBBBBK...', '...KKKKKK...'],
]

export const DANTE: readonly Sprite[] = FEET.map(feet => [...DANTE_BODY, ...feet])
export const VIRGIL: readonly Sprite[] = FEET.map(feet => [...VIRGIL_BODY, ...feet])

/** A soul blown about, pushing or sinking. */
export const SOUL: Sprite = art('..OOO..', '.OOOOO.', '.OVOVO.', '.OOOOO.', '..OoO..', '.OOOOOO', 'OOOOOO.', '.OOOOo.', '..OOOo.', '..Ooo..', '...oo..')
/** Only the head: in the swamp, in the ice. */
export const HEAD: Sprite = art('.OOO.', 'OOOOO', 'OVOVO', 'OOOOO', '.ooo.')
export const SKULL: Sprite = art('.jjj.', 'jjjjj', 'jVjVj', 'jjjjj', '.jVj.')

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

export const MINOS: Sprite = art(
  '.....GG.GG.GG....',
  '.....GGGGGGGG....',
  '.....xXXXXXXx....',
  '.....xXEXXEXx....',
  '.....xXXXXXXx....',
  '.....xWWWWWWx....',
  '....xxXWWWWXxx...',
  '...xXXXXWWXXXXx..',
  '..xXXxXXXXXXxXXx.',
  '..xXXxXXXXXXxXXx.',
  '..xXx.xXXXXx.xXx.',
  '...xx.xXXXXx.xx..',
  '......xXXXXx.....',
  '.....xXXXXXXx....',
  '....xXXxxxxXXx...',
  '....xXXx..xXXx...',
  '...xXXXx..xXXXx..',
  '...xxxxx..xxxxx..',
)

export const CERBERUS: readonly Sprite[] = [
  art(
    '..f.f...f.f...f.f.............',
    '..fff...fff...fff.............',
    '.fFFFf.fFFFf.fFFFf............',
    '.fEFEf.fEFEf.fEFEf............',
    'fFFFFfffFFFFffFFFFf.........f.',
    'KWKWFFFKWKWFFFKWKFFf.......fF.',
    '.fFFFFFfFFFFFFfFFFFFf.....fF..',
    '..fffFFFFFFFFFFFFFFFFfffffFf..',
    '.....fFFFFFFFFFFFFFFFFFFFFf...',
    '......fFFFFFFFFFFFFFFFFFFFf...',
    '......fFFffFFFFFFFFFffFFFf....',
    '......fFf.fFFf...fFFf.fFFf....',
    '......fFf..fFf...fFf...fFf....',
    '.....ffff.ffff..ffff..ffff....',
  ),
  art(
    '..............................',
    '..f.f...f.f...f.f.............',
    '..fff...fff...fff.........f...',
    '.fFFFf.fFFFf.fFFFf........fF..',
    '.fEFEf.fEFEf.fEFEf.........fF.',
    'fFFFFfffFFFFffFFFFf........fF.',
    'KWKWKFFKWKWKFFKWKFFf......fF..',
    'fWFWFFFfWFWFFFfFFFFFfffffFFf..',
    '.ffffFFFFFFFFFFFFFFFFFFFFFf...',
    '......fFFFFFFFFFFFFFFFFFFFf...',
    '......fFFffFFFFFFFFFffFFFf....',
    '.......fFf.fFf..fFf..fFFf.....',
    '.......fFf.fFf..fFf...fFf.....',
    '......ffff.ffff.ffff.ffff.....',
  ),
]

export const CENTAUR: readonly Sprite[] = [0, 1].map(step =>
  art(
    '.........xxx........',
    '........xSSKS....k..',
    '........xSSSS...k.k.',
    '.........SSs....k..k',
    '........XXXXX..kk..k',
    '.......XXXXXXXSSSSSk',
    '.......XXxXXXX.k...k',
    '.......XXXXXX...k..k',
    '..xxxxxxXXXXX...k.k.',
    '.xXXXXXXXXXXX....k..',
    'xxXXXXXXXXXXX.......',
    'x.XXXXXXXXXXX.......',
    'x.XXxxxxxXXXx.......',
    ...(step === 0 ? ['..XXx...xXXx........', '..Xx.....xX.........', '..X......X..........', '..K......K..........'] : ['..XXx...xXXx........', '.xX.....xXx.........', '.X......xX..........', '.K.......K..........']),
  ),
)

/** Geryon: the face of a just man, the body of a serpent. */
export const GERYON: readonly Sprite[] = [
  art(
    '..........qqq...................',
    '..SS.....qQQQq..................',
    '.SSKS...qQQQQQq.................',
    '.SSSS..qQQQQQQQq................',
    '..SSQqqQQQQqQQQQqq..............',
    '..qQQQQQQQqQQqQQQQq..........q..',
    '...qQQQQQqQQQQqQQQQqq......qqQq.',
    '....qqQQQQQQQQQqQQQQQqq..qqQQq..',
    '..q..q.qqQQQQQQQQQQQQQQqqQQqq...',
    '..qq.q...qqqQQQQQQQQQQQQQqq.....',
    '...q.qq.....qqqqQQQQQqqq........',
  ),
  art(
    '................................',
    '..SS............................',
    '.SSKS...........................',
    '.SSSS....qqqqqq.................',
    '..SSQqqqqQQQQQQqq............q..',
    '..qQQQQQQQQqQQqQQqq.........qQq.',
    '...qQQQQQqQQQQqQQQQqq......qQQq.',
    '....qqQQqQQQQQQqQQQQQqq..qqQQq..',
    '..q..qqQQQQQQQQQQQQQQQQqqQQqq...',
    '..qq.qQQQqqqQQQQQQQQQQQQQqq.....',
    '...q.qqqq...qqqqQQQQQqqq........',
  ),
]

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

// A 3 x 5 pixel alphabet: what is cut in the rock.
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '111101101101101', O: '111101101101111',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '%': '101001010100101', '/': '001001010100100', ':': '000010000010000', '.': '000000000000010',
  '-': '000000111000000', '&': '010101010101011', "'": '010010000000000', '!': '010010010000010', '?': '110001010000010',
}

const BIG: Record<string, string> = {
  D: '11110100011000110001100011000111110', A: '01110100011000111111100011000110001',
  N: '10001110011010110011100011000110001', T: '11111001000010000100001000010000100',
  E: '11111100001000011110100001000011111',
}

/** Capitals without accents, as the alphabet has them. */
export const capitals = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9%/:.\-&'!? ]/g, ' ').replace(/ +/g, ' ').trim()

export const textWidth = (text: string): number => text.length * 4 - 1

/** Write text with its top left corner at (x, y). */
export function write({ w, h, px }: Canvas, text: string, x: number, y: number, color: number): void {
  ;[...text].forEach((letter, n) => {
    const glyph = GLYPHS[letter]
    if (glyph === undefined) return
    for (let i = 0; i < 15; i++) {
      if (glyph[i] !== '1') continue
      const X = x + n * 4 + (i % 3)
      const Y = y + Math.floor(i / 3)
      if (X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
    }
  })
}

/** One of the five letters of DANTE, 5 x 7. */
export function writeBig({ w, h, px }: Canvas, letter: string, x: number, y: number, color: number): void {
  const glyph = BIG[letter] ?? ''
  for (let i = 0; i < glyph.length; i++) {
    const X = x + (i % 5)
    const Y = y + Math.floor(i / 5)
    if (glyph[i] === '1' && X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
  }
}

/** Break text into at most `most` lines of `wide` letters; what does not fit ends in dots. */
export function wrap(text: string, wide: number, most: number): string[] {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= wide) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  const kept = lines.slice(0, most).map(line => line.slice(0, wide))
  if (lines.length > most) kept[most - 1] = `${kept[most - 1]!.slice(0, wide - 2)}..`
  return kept
}
