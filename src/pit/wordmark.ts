// The name in Roman capitals, with the laurel on the A: on the sign over the gate, and on the screen
// of the cover (scripts/draw-readme.mjs). Pixels are tones, so each place inks them its own way.

/** 0 is see-through; 1 to 6 go down the letters, from where the light falls to the foot; then the laurel. */
export interface Wordmark {
  w: number
  h: number
  px: Uint8Array
}

/** The colour of each tone, as the screen of the cover has them. */
export const TONES = ['', 'e9614a', 'd8432f', 'c8372a', 'ab2c20', '86221a', '5c1510', 'bedb84', '587a34', 'f2cb7a', 'efc766'] as const
const STEPS = 6
const LEAVES: Record<string, number> = { g: 7, G: 8, y: 9, Y: 10 }

const LAUREL = [
  '....g.........g....',
  '..g.Gg.......gG.g..',
  '.gGg.Gg..y..gG.gGg.',
  '..GgG.GggyggG.GgG..',
  '.g.GGgGGgYgGGgGG.g.',
  '..GgGGgGYYYGgGGgG..',
  '....GGgGGYGGgGG....',
]

type IsIn = (x: number, y: number) => boolean
const box = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1
const within = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1
/** A slanting stroke, from `xa` at the top to `xb` at the foot. */
const slant = (x: number, y: number, xa: number, xb: number, thick: number): boolean => Math.abs(x - (xa + ((xb - xa) * y) / 50)) < thick / 2
/** A serif: a thin foot that swells into the stem it belongs to. */
function serif(x: number, y: number, from: number, to: number, stemFrom: number, stemTo: number, isTop: boolean): boolean {
  const d = isTop ? y : 50 - y
  if (d < 0 || d >= 7) return false
  if (d < 3) return x >= from && x < to
  const swell = (7 - d) * 0.55
  return x >= stemFrom - swell && x < stemTo + swell
}

/** D, A, N, T, E, each on a field of 36 x 50. */
const LETTERS: readonly IsIn[] = [
  (x, y) => box(x, y, 5, 0, 14, 50) || serif(x, y, 0, 18, 5, 14, true) || serif(x, y, 0, 18, 5, 14, false) || (x >= 9 && within(x, y, 12, 25, 24, 25) && !(within(x, y, 11, 25, 14.5, 20.5) && x > 13)),
  (x, y) => (slant(x, y, 17, 5, 5) && y > 2) || (slant(x, y, 18, 29, 10) && y > 0) || box(x, y, 9, 31, 27, 35) || serif(x, y, 0, 11, 3, 8, false) || serif(x, y, 21, 36, 24, 34, false),
  (x, y) => box(x, y, 4, 0, 9, 50) || box(x, y, 28, 0, 33, 50) || slant(x, y, 8, 29, 11) || serif(x, y, 0, 12, 4, 9, true) || serif(x, y, 0, 14, 4, 9, false) || serif(x, y, 23, 36, 28, 33, true),
  (x, y) => box(x, y, 1, 0, 35, 6) || box(x, y, 13, 0, 23, 50) || serif(x, y, 7, 29, 13, 23, false) || (y < 14 && ((x >= 1 && x < 5 - (y - 6) * 0.35) || (x < 35 && x >= 31 + (y - 6) * 0.35))),
  (x, y) =>
    box(x, y, 5, 0, 14, 50) || box(x, y, 5, 0, 31, 5) || box(x, y, 5, 22, 25, 27) || box(x, y, 5, 45, 33, 50) || serif(x, y, 0, 18, 5, 14, true) || serif(x, y, 0, 18, 5, 14, false) ||
    (y < 13 && x < 31 && x >= 27 + (y - 5) * 0.4) || (y >= 37 && x < 33 && x >= 29 - (y - 45) * 0.4) || (Math.abs(y - 24.5) < 6 && x < 25 && x >= 21.5 + Math.abs(y - 24.5) * 0.3),
]

/** The same five by hand, 13 x 14, for where geometry is too coarse to keep their thins and thicks. */
const SMALL: readonly (readonly string[])[] = [
  [
    '#########....',
    '.##########..',
    '..###..#####.',
    '..###....###.',
    '..###....####',
    '..###.....###',
    '..###.....###',
    '..###.....###',
    '..###.....###',
    '..###....####',
    '..###....###.',
    '..###..#####.',
    '.##########..',
    '#########....',
  ],
  [
    '......#......',
    '......##.....',
    '.....###.....',
    '.....####....',
    '....#.###....',
    '....#.###....',
    '....#..###...',
    '...#...###...',
    '...########..',
    '...#....###..',
    '..#.....###..',
    '..#......###.',
    '.###.....###.',
    '#####...#####',
  ],
  [
    '####.....####',
    '.####.....##.',
    '..####.....#.',
    '..#####....#.',
    '..#.####...#.',
    '..#..###...#.',
    '..#..####..#.',
    '..#...####.#.',
    '..#....###.#.',
    '..#....#####.',
    '..#.....####.',
    '..#......###.',
    '.###.....###.',
    '#####.....##.',
  ],
  [
    '#############',
    '#############',
    '##...###...##',
    '#....###....#',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '....#####....',
    '..#########..',
  ],
  [
    '###########..',
    '.##########..',
    '..###....##..',
    '..###.....#..',
    '..###........',
    '..###...#....',
    '..#######....',
    '..#######....',
    '..###...#....',
    '..###........',
    '..###......#.',
    '..###.....##.',
    '.###########.',
    '############.',
  ],
]
const [WIDE, TALL, GAP] = [13, 14, 3]
const SMALL_LAUREL = ['.gg.....gg.', 'gGGg.y.gGGg', '.GGGyYyGGG.', '...GGYGG...']
/** The small name with its laurel. */
export const SMALL_SIZE = { w: WIDE * 5 + GAP * 4, h: TALL + SMALL_LAUREL.length } as const

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Coals at the foot, cooling as they rise; light from above and to the left. */
function shade(on: Uint8Array, w: number, h: number, top: number, tall: number): Uint8Array {
  const px = new Uint8Array(w * h)
  const is = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x] === 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!is(x, y)) continue
      const step = Math.min(STEPS - 1, Math.max(0, Math.floor(((y - top) / tall) * 4.2 + 0.2 + (BAYER[(y % 4) * 4 + (x % 4)]! / 16) * 0.9)))
      const isEdge = !is(x - 1, y) || !is(x, y - 1)
      const isShade = !is(x + 1, y) || !is(x, y + 1)
      px[y * w + x] = 1 + (isEdge && !isShade ? Math.max(0, step - 2) : isShade ? Math.min(STEPS - 1, step + 2) : step)
    }
  }
  return px
}

function crown(px: Uint8Array, w: number, laurel: readonly string[], left: number): void {
  laurel.forEach((row, y) => [...row].forEach((dot, x) => dot !== '.' && (px[y * w + left + x] = LEAVES[dot]!)))
}

/** The name as large as `w` x `h` lets it be. */
export function wordmark(w: number, h: number): Wordmark {
  const gap = 6
  const wide = Math.floor((w - gap * 4) / 5)
  const left = Math.floor((w - wide * 5 - gap * 4) / 2)
  const top = 7
  const tall = h - top - 2
  const on = new Uint8Array(w * h)
  LETTERS.forEach((isIn, n) => {
    const x0 = left + n * (wide + gap)
    for (let y = 0; y < tall; y++) for (let x = 0; x < wide; x++) if (isIn(((x + 0.5) / wide) * 36, ((y + 0.5) / tall) * 50)) on[(top + y) * w + x0 + x] = 1
  })
  const px = shade(on, w, h, top, tall)
  crown(px, w, LAUREL, left + wide + gap + Math.round((17.5 * wide) / 36) - 9)
  return { w, h, px }
}

/** The name at its smallest. */
export function smallWordmark(): Wordmark {
  const { w, h } = SMALL_SIZE
  const on = new Uint8Array(w * h)
  const top = h - TALL
  SMALL.forEach((rows, n) => rows.forEach((row, y) => [...row].forEach((dot, x) => dot === '#' && (on[(top + y) * w + n * (WIDE + GAP) + x] = 1))))
  const px = shade(on, w, h, top, TALL)
  crown(px, w, SMALL_LAUREL, WIDE + GAP + 1)
  return { w, h, px }
}
