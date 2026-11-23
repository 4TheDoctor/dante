import { SPOT, type SpotName } from './palette.js'

const KEY: Record<string, SpotName> = {
  K: 'outline', R: 'robe', r: 'robeDark', H: 'robeLight', W: 'coif', S: 'skin', s: 'skinShade',
  L: 'laurel', l: 'laurelDark', G: 'laurelGold', T: 'toga', t: 'togaShade', d: 'togaDark', h: 'hair',
  B: 'boot', O: 'soul', o: 'soulDim', E: 'eye', V: 'void',
}

export type Sprite = readonly string[]

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
export const SOUL: Sprite = ['.OO.', 'OooO', '.OO.', 'OOOo', '.Oo.', '.oo.']

export const CERBERUS: Sprite = [
  '.KK.KK.KK.........',
  'KVVKVVKVVK........',
  'KVEKVEKVEK........',
  'VVVVVVVVVVK......K',
  '.KVVVVVVVVVKKKKKKV',
  '..KVVVVVVVVVVVVVVK',
  '...VVVVVVVVVVVVVK.',
  '...VVKVVKKVVKVVK..',
  '...VK.VK..VK.VK...',
]

/** Lucifer to the waist in the ice. The wings have two positions. */
export const LUCIFER: readonly Sprite[] = [
  [
    'V.........................V',
    'VV........K.....K........VV',
    'VVV.......KV...VK.......VVV',
    'VVVV......VVVVVVV......VVVV',
    'VVVVV....VVEVEVEVV....VVVVV',
    'VVVVVV...VVVVVVVVV...VVVVVV',
    'VVVVVVV..VVVEEEVVV..VVVVVVV',
    'VV.VVVVV..VVVVVVV..VVVVV.VV',
    'V..VVVVVVVVVVVVVVVVVVVVV..V',
    '...VV.VVVVVVVVVVVVVVV.VV...',
    '...V..VVVVVVVVVVVVVVV..V...',
    '......VV.VVVVVVVVV.VV......',
    '......V..VVVVVVVVV..V......',
    '.........VVVVVVVVV.........',
  ],
  [
    '...........................',
    '..........K.....K..........',
    '..........KV...VK..........',
    '.VV.......VVVVVVV.......VV.',
    'VVVVV....VVEVEVEVV....VVVVV',
    'VVVVVVV..VVVVVVVVV..VVVVVVV',
    'VVVVVVVV.VVVEEEVVV.VVVVVVVV',
    'VVVVVVVVV.VVVVVVV.VVVVVVVVV',
    'VVVVVVVVVVVVVVVVVVVVVVVVVVV',
    'VVV.VVVVVVVVVVVVVVVVVVV.VVV',
    'VV...VVVVVVVVVVVVVVVVV...VV',
    'V....VV..VVVVVVVVV..VV....V',
    '.....V...VVVVVVVVV...V.....',
    '.........VVVVVVVVV.........',
  ],
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

// A 3 x 5 pixel alphabet: the gate's inscription and the numbers of the circles.
const GLYPHS: Record<string, string> = {
  A: '010101111101101', C: '111100100100111', E: '111100110100111', G: '111100101101111', I: '111010010010111',
  L: '100100100100111', N: '101111111101101', O: '111101101101111', P: '111101111100100', R: '110101110101101',
  S: '111100111001111', T: '111010010010010', V: '101101101101010', X: '101101010101101', Z: '111001010100111',
}

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
