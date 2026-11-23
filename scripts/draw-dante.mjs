// Draws Dante, pixel by pixel: the header's acts (plugin/art/dante/<act>/NN.png, and their timing in
// plugin/hooks/acts.ts) and the plugin listing icon (plugin/.claude-plugin/icon.png). No dependencies.
// Run: node scripts/draw-dante.mjs [--sheet FILE.png]
import { deflateSync } from 'node:zlib'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// The header slot is 11 x 4 cells. At the smallest cell, 7 x 16 px, that holds 38 x 32 drawn pixels
// of 2 x 2; a taller cell leaves room above and below and the pixels stay whole. Files are made at
// twice the size, for screens that have two pixels where others have one.
const COLUMNS = 11
const ROWS = 4
const CELL = { width: 7, height: 16 }
const PIXEL = 2
const DENSITY = 2
const W = Math.floor((COLUMNS * CELL.width) / PIXEL)
const H = (ROWS * CELL.height) / PIXEL
/** Where he stands on the canvas: what he holds needs room on his left hand's side. */
const AT = 2
const CLEAR = null

// ---------------------------------------------------------------- colours

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const C = Object.fromEntries(
  Object.entries({
    K: '#1A0E0B', // outline
    R: '#D03A2A', r: '#8E2418', H: '#EF6A4A', q: '#6A1810', // hood
    S: '#E8BE90', s: '#C08A5E', t: '#96683F', h: '#F6D8AE', // skin
    W: '#F3E7D3', w: '#CDBFA6', // coif
    G: '#F0C35A', g: '#A87B2E', L: '#8FB65A', l: '#5E7F35', M: '#BEDB84', Y: '#FFE9A6', // laurel
    E: '#FBF3E4', T: '#7A2A22', O: '#4A1512', // eye, tongue, mouth
    c: '#8E6A3A', C: '#5E3F22', // leather
    p: '#F4E6C4', P: '#D9C294', i: '#6B5138', // page, ink
    a: '#CDD5DE', b: '#8A95A3', d: '#424C58', // metal
    x: '#E8402A', y: '#4FC3E8', // the two lenses
    u: '#7FD0F0', // sweat
    z: '#3A322E', Z: '#57504A', v: '#8B837B', V: '#B9B1A8', // soot and smoke
    1: '#2E0703', 2: '#8F1D08', 3: '#C2330C', 4: '#E95817', 5: '#F98628', 6: '#FDB545', 7: '#FEDD7C', 8: '#FFF6D2', // fire
    j: '#FFF2CF', J: '#F0CD78', // popcorn
    k: '#8EA2D6', m: '#FFFFFF', // stars
  }).map(([key, hex]) => [key, rgb(hex)]),
)

// ---------------------------------------------------------------- canvas

const blank = () => new Array(W * H).fill(CLEAR)
const put = (px, x, y, color) => {
  if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = typeof color === 'string' ? C[color] : color
}
const at = (px, x, y) => (x >= 0 && y >= 0 && x < W && y < H ? px[y * W + x] : CLEAR)
const stamp = (px, rows, x, y, swap = {}) =>
  rows.forEach((row, dy) => [...row].forEach((key, dx) => key !== '.' && key !== ' ' && put(px, x + dx, y + dy, swap[key] ?? key)))
const flip = rows => rows.map(row => [...row].reverse().join(''))
const move = (px, dx, dy) => {
  const out = blank()
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(out, x + dx, y + dy, at(px, x, y))
  return out
}
const over = (under, top) => under.map((color, n) => top[n] ?? color)
const mix = (a, b, share) => a.map((v, n) => Math.round(v + (b[n] - v) * share))
/** The same noise every time. */
const noise = (...n) => {
  let seed = 2166136261
  for (const v of n) seed = Math.imul(seed ^ (v + 1013), 16777619)
  seed ^= seed >>> 13
  seed = Math.imul(seed, 0x5bd1e995)
  return ((seed ^ (seed >>> 15)) >>> 0) / 2 ** 32
}

// ---------------------------------------------------------------- Dante

/** His left half; the right is its mirror. Hood, coif, face and shoulders. */
const HALF = [
  '..........KKKKK',
  '........KKRRRRR',
  '......KKRRRRRRR',
  '.....KRRRRRRRRR',
  '....KRRRRRRRRRR',
  '...KRRRRRRRRRRR',
  '..KRRRRRRRRRRRR',
  '..KRRRRRRRRRRRR',
  '.KRRRRRRRRRRRRR',
  '.KRRRRRRRRRRRRR',
  '.KRRKKRRRRRRRRR',
  '.KRRKWKKKKKKKKK',
  '.KRRKWWtttttttt',
  '.KRRKWWSSSSSSSS',
  '.KRRKWWSSSSSSSS',
  '.KRRKWWSSSSSSSS',
  '.KRrKWWSSSSSSSS',
  '.KRrKWWSSSSSSSS',
  '.KRrKWWSSSSSSSS',
  '.KRrKWWSSSSSSSS',
  '.KRrKWWSSSSSSSS',
  '.KRrKWWsSSSSSSS',
  '.KRrKWwsSSSSSSS',
  '.KRrqKWwsSSSSSS',
  '.KRrqKWwsSSSSSS',
  '..KRrqKWwsSSSSS',
  '..KRrqKKwwsssss',
  '.KRRrrqKKKwwsss',
  'KRRRrrrqqqKKKKK',
  'KRRRRrrrrqqqqqq',
  'RRRRRRRrrrrrrqq',
  'RRRRRRRRRRRrrrr',
]
for (const row of HALF) if (row.length !== 15) throw new Error(`a row of ${row.length}: ${row}`)
const FIGURE = HALF.map(row => row + [...row].reverse().join(''))

/** Light falls from the upper left. */
const HOOD_LIGHT = [[10, 1], [9, 2], [10, 2], [11, 2], [8, 3], [9, 3], [7, 4], [8, 4], [6, 5], [7, 5], [5, 6], [6, 6], [2, 13], [2, 14], [2, 15], [2, 29], [3, 29], [4, 30], [5, 30]]
const HOOD_SHADE = [[21, 2], [22, 3], [23, 3], [23, 4], [24, 4], [24, 5], [25, 5], [25, 6], [26, 6], [26, 7], [25, 7], [27, 8], [26, 8], [27, 9], [27, 10], [27, 11], [27, 12], [27, 13], [27, 14], [27, 15], [26, 14], [26, 15], [27, 16], [27, 17], [27, 18], [27, 19], [27, 20]]
const FOLD = [[14, 1], [15, 2], [15, 3], [16, 4], [16, 5]]

/** One leaf of the laurel, its tip to the right; the left half wears them, the right half their mirror. */
const LEAF = ['.LMl.', 'LLLMK', '.llK.']
const LEAF_UNDER = ['Ll..', '.lLl']
const LEAVES = [[1, 5], [4, 7], [8, 8], [11, 9]]
const BERRIES = [[3, 8], [7, 10], [14, 9]]

function laurel(px, dy = 0, glint = -1, isGold = false) {
  const gold = isGold ? { L: 'G', M: 'Y', l: 'g' } : {}
  for (const side of [0, 1]) {
    const x = left => AT + (side ? 29 - left : left)
    LEAVES.forEach(([lx, ly], n) => {
      const order = side ? 7 - n : n
      const swap = glint === order ? { L: 'Y', M: 'm', l: 'G' } : Math.abs(glint - order) === 1 && glint >= 0 ? { L: 'M', M: 'Y' } : gold
      const rows = side ? flip(LEAF) : LEAF
      stamp(px, rows, side ? AT + 29 - lx - 4 : AT + lx, ly + dy, swap)
      // A second leaf of each pair, under the first.
      stamp(px, side ? flip(LEAF_UNDER) : LEAF_UNDER, side ? AT + 29 - lx - 3 : AT + lx + 1, ly + 2 + dy, swap)
    })
    for (const [bx, by] of BERRIES) {
      put(px, x(bx), by + dy, 'G')
      put(px, x(bx), by + 1 + dy, 'g')
    }
  }
}

/** Eyes look by whole pixels: `x` -1 to 1, `y` 0 or 1. */
function eyes(px, { look = [0, 0], lids: both = 'open', brows = 'stern', dy = 0 } = {}) {
  for (const side of [0, 1]) {
    const lids = both === 'wink' ? (side ? 'happy' : 'open') : both
    const X = n => AT + (side ? 29 - n : n)
    const set = (n, y, color) => put(px, X(n), y + dy, color)
    // Brows.
    const brow = {
      stern: [[8, 14], [9, 14], [10, 14], [9, 15], [10, 15], [11, 15], [12, 15]],
      angry: [[8, 13], [9, 13], [9, 14], [10, 14], [11, 14], [10, 15], [11, 15], [12, 15], [12, 16]],
      level: [[8, 14], [9, 14], [10, 14], [11, 14], [12, 14]],
      up: [[8, 14], [9, 13], [10, 13], [11, 13], [12, 14], [9, 14], [10, 14]],
      sad: [[8, 15], [9, 15], [9, 14], [10, 14], [11, 14], [11, 13], [12, 13]],
      soft: [[8, 14], [9, 13], [10, 13], [11, 13], [12, 14]],
      one: side ? [[8, 14], [9, 13], [10, 13], [11, 13], [12, 14], [9, 14], [10, 14]] : [[8, 14], [9, 14], [10, 14], [9, 15], [10, 15], [11, 15], [12, 15]],
    }[brows]
    for (const [x, y] of brow) set(x, y, 'K')
    if (lids === 'open' || lids === 'wide') {
      const top = lids === 'wide' ? 16 : 17
      for (let x = 9; x <= 12; x++) {
        set(x, top - 1, 't')
        for (let y = top; y <= 18; y++) set(x, y, 'E')
        set(x, 19, 's')
      }
      set(8, 17, 't')
      const pupil = AT + (side ? 18 : 10) + look[0]
      for (const x of [pupil, pupil + 1]) {
        if (look[1] <= 0) put(px, x, 17 + dy, 'K')
        if (look[1] >= 0) put(px, x, 18 + dy, 'K')
      }
      if (look[1] === 0) put(px, pupil + (look[0] > 0 ? 1 : 0), 17 + dy, 'C')
      // Looking down, the lid comes with the eye.
      if (look[1] > 0) for (let x = 9; x <= 12; x++) set(x, 17, 't')
    } else if (lids === 'half') {
      for (let x = 9; x <= 12; x++) {
        set(x, 16, 't')
        set(x, 17, 's')
        set(x, 18, x === 10 || x === 11 ? 'K' : 'E')
        set(x, 19, 's')
      }
    } else if (lids === 'closed') {
      for (let x = 9; x <= 12; x++) {
        set(x, 17, 's')
        set(x, 18, 'K')
      }
      set(8, 17, 't')
    } else if (lids === 'happy') {
      for (const [x, y] of [[8, 18], [9, 17], [10, 16], [11, 16], [12, 17], [13, 18]]) set(x, y, 'K')
    } else if (lids === 'tight') {
      for (const [x, y] of [[9, 16], [10, 17], [11, 17], [12, 18], [11, 18], [10, 18], [9, 19]]) set(x, y, 'K')
    }
  }
}

/** The nose he is known for: high bridge, hooked tip. */
function nose(px, dy = 0) {
  const set = (x, y, color) => put(px, AT + x, y + dy, color)
  for (let y = 15; y <= 20; y++) set(14, y, 'h')
  for (let y = 16; y <= 20; y++) set(16, y, 's')
  for (const [x, y, color] of [[13, 15, 's'], [13, 16, 's'], [15, 14, 's'], [14, 14, 's'], [13, 20, 's'], [13, 21, 't'], [14, 21, 'h'], [15, 21, 'S'], [16, 21, 't'], [17, 21, 's'], [14, 22, 't'], [15, 22, 't'], [13, 22, 's'], [16, 22, 's']]) set(x, y, color)
}

function mouth(px, kind = 'stern', dy = 0) {
  const set = (x, y, color) => put(px, AT + x, y + dy, color)
  const row = (from, to, y, color) => {
    for (let x = from; x <= to; x++) set(x, y, color)
  }
  if (kind === 'stern') {
    row(11, 18, 24, 'K')
    set(10, 25, 'K')
    set(19, 25, 'K')
    row(13, 16, 25, 's')
  } else if (kind === 'flat') {
    row(12, 17, 24, 'K')
    row(13, 16, 25, 's')
  } else if (kind === 'smile') {
    set(10, 23, 'K')
    set(19, 23, 'K')
    row(11, 12, 24, 'K')
    row(17, 18, 24, 'K')
    row(13, 16, 25, 'K')
    row(13, 16, 24, 'E')
  } else if (kind === 'side') {
    row(12, 17, 24, 'K')
    set(18, 23, 'K')
    set(19, 23, 'K')
    row(13, 16, 25, 's')
  } else if (kind === 'o') {
    row(14, 15, 23, 'K')
    row(13, 16, 24, 'O')
    row(14, 15, 25, 'K')
  } else if (kind === 'scream') {
    row(12, 17, 23, 'K')
    row(11, 18, 24, 'O')
    row(11, 18, 25, 'O')
    row(13, 16, 25, 'T')
    row(12, 17, 26, 'K')
    set(11, 24, 'K'); set(18, 24, 'K'); set(11, 25, 'K'); set(18, 25, 'K')
  } else if (kind === 'grit') {
    row(11, 18, 23, 'K')
    row(11, 18, 24, 'E')
    for (const x of [13, 15, 17]) set(x, 24, 'w')
    row(11, 18, 25, 'K')
    set(10, 24, 'K'); set(19, 24, 'K')
  } else if (kind === 'chew') {
    row(12, 16, 24, 'K')
    set(17, 23, 'K')
    set(18, 22, 's'); set(19, 23, 's'); set(19, 24, 's'); set(18, 25, 's')
  } else if (kind === 'chew2') {
    row(13, 17, 24, 'K')
    set(12, 25, 'K')
    set(10, 23, 's'); set(10, 24, 's'); set(11, 25, 's')
  } else if (kind === 'open') {
    row(12, 17, 23, 'K')
    row(12, 17, 24, 'O')
    row(13, 16, 25, 'T')
    row(13, 16, 26, 'K')
    set(12, 25, 'K'); set(17, 25, 'K')
  } else if (kind === 'mutter') {
    row(12, 17, 24, 'K')
    row(14, 15, 25, 'O')
  }
}

/** Lines of a stern face: hollow cheeks and the fold beside the mouth. */
function lines(px, dy = 0) {
  for (const [x, y] of [[8, 21], [9, 22], [9, 23], [21, 21], [20, 22], [20, 23], [21, 22]]) put(px, AT + x, y + dy, 's')
}

/** All of him. `dip` lowers the whole figure; `nod` only the face inside the hood. */
function dante({ look, lids, brows, lips, dip = 0, nod = 0, glint = -1, isGold = false, hasFace = true } = {}) {
  const px = blank()
  stamp(px, FIGURE, AT, 0)
  for (const [x, y] of HOOD_LIGHT) put(px, AT + x, y, 'H')
  for (const [x, y] of HOOD_SHADE) put(px, AT + x, y, 'r')
  for (const [x, y] of FOLD) put(px, AT + x, y, 'r')
  laurel(px, 0, glint, isGold)
  if (hasFace) {
    nose(px, nod)
    lines(px, nod)
    eyes(px, { look, lids, brows, dy: nod })
    mouth(px, lips, nod)
  }
  return dip === 0 ? px : move(px, 0, dip)
}

// ---------------------------------------------------------------- what he holds

const FIST = ['.KKKKK.', 'KSShSSK', 'KSsSsSK', 'KsSsSsK', '.KKKKK.']
const CHIN = ['.KKKKKKKKK..', 'KShSShSShSK.', 'KSSsSSsSSsSK', 'KSSsSSsSSsSK', 'KsSsSSsSSsSK', '.KsssssssSK.']
const PINCH = ['..KK...', '.KShK..', 'KSSSSK.', 'KsSSsSK', '.KKsSSK', '...KKK.']

function sleeve(px, x, y, height = 8) {
  for (let dy = 0; dy < height; dy++) {
    const wide = 6 + Math.min(3, Math.floor(dy / 2))
    for (let dx = 0; dx < wide; dx++) put(px, x + dx, y + dy, dx === 0 || dx === wide - 1 ? 'K' : dx < 2 ? 'H' : dx > wide - 3 ? 'r' : 'R')
  }
}

function line(px, x0, y0, x1, y1, color) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let k = 0; k <= n; k++) put(px, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), color)
}

/** Light from a point: what is near takes its colour, what is far goes dark. */
function lit(px, { x, y, reach, color, dark, most = 0.4 }) {
  return px.map((old, n) => {
    if (old === CLEAR) return old
    const away = Math.hypot((n % W) - x, Math.floor(n / W) - y)
    const near = Math.round(Math.max(0, 1 - away / reach) * 5) / 5
    const shaded = old.map(v => Math.round(v * (dark + (1 - dark) * near)))
    return mix(shaded, color, near * most)
  })
}

/** A flame `wide` pixels wide standing on `y`, `tall` at its highest, at moment `t`. */
function flame(px, cx, y, wide, tall, t) {
  const half = wide / 2
  for (let dx = -Math.floor(half); dx <= Math.floor(half); dx++) {
    const arch = 1 - (Math.abs(dx) / (half + 0.6)) ** 1.6
    const high = Math.max(1, Math.round(tall * arch * (0.72 + 0.45 * noise(dx, t))))
    const lean = Math.round((noise(t, 7) - 0.5) * 2)
    for (let k = 0; k < high; k++) {
      const heat = (1 - k / high) * arch
      const color = heat > 0.74 ? '8' : heat > 0.56 ? '7' : heat > 0.42 ? '6' : heat > 0.28 ? '5' : heat > 0.16 ? '4' : '3'
      put(px, cx + dx + (k > high * 0.6 ? lean : 0), y - k, color)
    }
  }
}

function spark(px, x, y, size, color = 'm') {
  put(px, x, y, color)
  for (let k = 1; k <= size; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) put(px, x + dx, y + dy, k === size ? 'Y' : color)
}

// ---------------------------------------------------------------- his acts

/** A picture and how long it stays, in beats of 100 ms (BEAT_MS in plugin/hooks/register.tsx). */
const hold = (px, beats = 1) => ({ px, beats })

/** Resting: he blinks, glances to one side and the other, and the light runs along his laurel. */
function idle() {
  return [
    hold(dante()),
    hold(dante({ lids: 'half' })),
    hold(dante({ lids: 'closed' }), 2),
    hold(dante({ lids: 'half' })),
    hold(dante(), 6),
    hold(dante({ look: [-1, 0] }), 8),
    hold(dante({ look: [1, 0], brows: 'one' }), 9),
    hold(dante({ brows: 'one' }), 3),
    hold(dante(), 4),
    ...Array.from({ length: 8 }, (_, n) => hold(dante({ glint: n }))),
    hold(dante(), 3),
  ]
}

/** Thinking, as he sits at the gates of hell: the fist under his chin. */
function ponder() {
  const pose = (face, lift = 0) => {
    const px = dante({ ...face })
    for (let y = 28; y < H; y++) for (let x = 17; x <= 24 + (y - 28); x++) put(px, AT + x, y - lift, x === 24 + (y - 28) ? 'K' : x > 22 ? 'r' : 'R')
    stamp(px, CHIN, AT + 10, 26 - lift)
    return px
  }
  return [
    hold(pose({ lids: 'half', lips: 'flat' }), 3),
    hold(pose({ look: [1, -1], brows: 'up', lips: 'flat' }), 7),
    hold(pose({ look: [1, -1], brows: 'up', lips: 'side' }), 4),
    hold(pose({ lids: 'closed', lips: 'flat' }, 0), 2),
    hold(pose({ look: [-1, -1], brows: 'up', lips: 'flat' }), 7),
    hold(pose({ look: [-1, -1], brows: 'one', lips: 'flat' }), 4),
    hold(pose({ lids: 'closed', lips: 'stern', brows: 'stern' }), 5),
    hold(pose({ lids: 'half', lips: 'flat' }), 2),
  ]
}

/** Writing: the quill runs along two lines of a verse, and he looks up for the next. */
function verse() {
  const pose = (written, at2, face = {}, lift = 0) => {
    const px = dante({ nod: 1, look: [at2 < 10 ? -1 : at2 > 18 ? 1 : 0, 1], lids: 'half', lips: 'flat', ...face })
    // The sheet.
    for (let y = 25; y < 32; y++) {
      for (let x = 4; x <= 27; x++) put(px, AT + x, y, x === 4 || x === 27 || y === 25 ? 'K' : y === 26 ? 'p' : x > 24 ? 'P' : 'p')
    }
    written.forEach((to, row) => {
      for (let x = 6; x <= to; x++) if (noise(x, row, 3) > 0.22) put(px, AT + x, 27 + row * 2, 'i')
    })
    // The quill and the hand that leads it.
    const qx = AT + at2
    const qy = (written.length > 1 ? 29 : 27) - lift
    put(px, qx, qy, 'K')
    put(px, qx + 1, qy - 1, 'i')
    for (let k = 2; k < 11; k++) {
      put(px, qx + k, qy - k, 'w')
      if (k > 3) {
        put(px, qx + k + 1, qy - k, 'E')
        put(px, qx + k, qy - k - 1, 'm')
      }
      if (k > 4) put(px, qx + k + 1, qy - k + 1, 'W')
    }
    stamp(px, PINCH, qx + 1, qy - 2)
    return px
  }
  return [
    ...[6, 8, 10, 12, 14, 16, 18, 20, 22].map((x, n) => hold(pose([x], x, {}, n % 2), 2)),
    hold(pose([23], 12, {}, 2)),
    ...[6, 8, 10, 12, 14, 16].map((x, n) => hold(pose([23, x], x, {}, n % 2), 2)),
    hold(pose([23, 16], 19, { lids: 'open', look: [1, -1], brows: 'up', lips: 'flat' }, 2), 6),
    hold(pose([23, 16], 19, { lids: 'open', look: [-1, -1], brows: 'up', lips: 'mutter' }, 2), 4),
    hold(pose([23, 16], 19, { lids: 'closed', lips: 'flat' }, 2)),
    ...[18, 20, 22].map((x, n) => hold(pose([23, x], x, {}, n % 2), 2)),
    hold(pose([23, 22], 22, { lids: 'closed', brows: 'soft', lips: 'smile' }, 1), 5),
  ]
}

/** The catalogue: he reads a thick book line by line and turns the page. */
function title() {
  const pose = (look, turn = -1, face = {}) => {
    const px = dante({ nod: 1, look: [look, 1], lids: 'open', lips: 'flat', ...face })
    const top = 23
    for (let y = top; y < 32; y++) {
      for (let x = 1; x <= 28; x++) {
        const spine = Math.abs(x - 14.5)
        const dipY = spine < 1.5 ? 1 : 0
        if (y < top + dipY) continue
        const isEdge = x === 1 || x === 28 || y === top + dipY
        put(px, AT + x, y, isEdge ? 'K' : x === 2 || x === 27 ? 'c' : spine < 1 ? 'P' : y === top + 1 ? 'm' : 'p')
      }
      for (const [from, to] of [[4, 12], [17, 25]]) {
        if (y > top + 1 && (y - top) % 2 === 1) for (let x = from; x <= to; x++) if (noise(x, y, from) > 0.25) put(px, AT + x, y, 'i')
      }
    }
    // A red initial, as in an old book.
    for (const [x, y] of [[4, 25], [5, 25], [4, 26], [5, 26]]) put(px, AT + x, y, 'x')
    if (turn >= 0) {
      // The page on its way from right to left, over the spine.
      const reach = [10, 5, 0, -5, -10][turn]
      const lift = [2, 5, 7, 5, 2][turn]
      for (let k = 0; k <= 12; k++) {
        const x = 14.5 + (reach * k) / 12
        const up = Math.round(lift * Math.sin((Math.PI * k) / 24))
        for (let y = top + 1 - up; y < 32 - up; y++) put(px, AT + Math.round(x), y, y === top + 1 - up ? 'K' : k > 10 ? 'P' : 'E')
      }
    }
    // Thumbs that hold it.
    for (const x of [0, 27]) {
      stamp(px, ['KKK', 'KhK', 'KSK', 'KsK'], AT + x, 28)
    }
    return px
  }
  return [
    hold(pose(-1), 3),
    hold(pose(0), 2),
    hold(pose(1), 3),
    hold(pose(-1), 3),
    hold(pose(0, -1, { brows: 'one' }), 2),
    hold(pose(1, -1, { brows: 'one' }), 3),
    ...[0, 1, 2, 3, 4].map(n => hold(pose(1 - Math.round(n / 2), n))),
    hold(pose(-1), 3),
    hold(pose(0), 2),
    hold(pose(1, -1, { lids: 'half' }), 1),
  ]
}

/** Looking for it: a magnifier goes over his face and back, and what is under it is twice the size. */
function search() {
  const pose = (cx, cy, face) => {
    const bare = dante({ lips: 'flat', ...face })
    const px = [...bare]
    const radius = 6
    for (let y = -radius - 2; y <= radius + 2; y++) {
      for (let x = -radius - 2; x <= radius + 2; x++) {
        const away = Math.hypot(x, y)
        if (away <= radius) {
          const seen = at(bare, Math.round(cx + x / 2), Math.round(cy + y / 2)) ?? C.K
          put(px, cx + x, cy + y, mix(seen, C.y, 0.1))
        } else if (away <= radius + 1.3) put(px, cx + x, cy + y, x + y < -3 ? 'Y' : x + y > 4 ? 'g' : 'G')
        else if (away <= radius + 2) put(px, cx + x, cy + y, 'K')
      }
    }
    // A glint on the glass.
    for (const [x, y] of [[-3, -4], [-4, -3], [-4, -2]]) put(px, cx + x, cy + y, 'm')
    // The handle, and the hand on it.
    for (let k = 0; k < 5; k++) {
      const x = cx + 5 + k
      const y = cy + 6 + k
      for (const [dx, color] of [[-1, 'K'], [0, 'c'], [1, 'C'], [2, 'K']]) put(px, x + dx, y, color)
    }
    stamp(px, FIST, cx + 6, cy + 9)
    return px
  }
  const path = [[9, 18], [10, 18], [12, 17], [14, 17], [16, 17], [18, 17], [20, 17], [22, 17], [23, 18]]
  const sweep = path.map(([x, y], n) => hold(pose(AT + x - 1, y, { look: [x < 13 ? -1 : x > 18 ? 1 : 0, 0], brows: n % 4 === 0 ? 'one' : 'stern' }), 2))
  return [
    { ...sweep[0], beats: 6 },
    ...sweep.slice(1, -1),
    { ...sweep.at(-1), beats: 6 },
    hold(pose(AT + 22, 18, { look: [1, 0], lids: 'half' })),
    hold(pose(AT + 22, 18, { look: [1, 0], brows: 'one' }), 3),
    ...sweep.slice(1, -1).reverse(),
    hold(pose(AT + 8, 18, { look: [-1, 0], lids: 'half' })),
  ]
}

/** Into the dark to see what is already there: a torch, and its light on one side of his face. */
function cache() {
  const pose = (t, face, lift = 0) => {
    const reach = 25 + Math.round(noise(t, 1) * 5)
    const fx = 33
    const fy = 14 - lift
    let px = dante({ lips: 'flat', ...face })
    px = lit(px, { x: fx, y: fy - 3, reach, color: C[6], dark: 0.42, most: 0.34 })
    // The torch.
    for (let y = fy; y < fy + 13; y++) for (const [dx, color] of [[-1, 'K'], [0, 'c'], [1, 'C'], [2, 'K']]) put(px, fx - 1 + dx, y, color)
    for (let y = fy; y < fy + 3; y++) for (const [dx, color] of [[-2, 'K'], [-1, 'b'], [0, 'a'], [1, 'b'], [2, 'd'], [3, 'K']]) put(px, fx - 1 + dx, y, color)
    flame(px, fx, fy - 1, 7, 11, t)
    for (let n = 0; n < 3; n++) {
      const y = fy - 8 - ((t * 2 + n * 4) % 9)
      put(px, fx - 2 + Math.round(noise(n, 5) * 4) + ((t + n) % 2), y, n % 2 ? '6' : '4')
    }
    sleeve(px, 29, fy + 12, 8)
    stamp(px, FIST, 29, fy + 8)
    return px
  }
  const faces = [
    ...Array(9).fill({ look: [-1, 0], brows: 'angry' }),
    ...Array(6).fill({ look: [0, 0], brows: 'angry' }),
    ...Array(9).fill({ look: [1, 0], brows: 'one' }),
    { lids: 'half' },
    ...Array(6).fill({ look: [0, -1], brows: 'up' }),
  ]
  return faces.map((face, n) => hold(pose(n, face, n > 23 ? 1 : 0)))
}

/** Hauling the links up, hand over hand, teeth shut. */
function add() {
  const pose = t => {
    const step = t % 8
    const isPull = step < 4
    const px = dante({ lids: isPull ? 'tight' : 'open', brows: 'angry', lips: isPull ? 'grit' : 'flat', dip: isPull ? 1 : 0, look: [1, 0] })
    const cx = 32
    for (let y = -8; y < H + 8; y++) {
      const k = (((y + t) % 8) + 8) % 8
      // One link seen flat, the next on edge.
      if (k < 5) {
        for (const [dx, color] of k === 0 || k === 4 ? [[0, 'b'], [1, 'a'], [2, 'b']] : [[-1, 'b'], [0, 'K'], [2, 'K'], [3, 'd']]) put(px, cx + dx, y, color)
        if (k === 0 || k === 4) for (const dx of [-1, 3]) put(px, cx + dx, y, 'K')
        else put(px, cx + 1, y, 'K')
      }
      if (k === 4 || k === 5 || k === 6 || k === 7 || k === 0) for (const [dx, color] of [[0, 'd'], [1, 'a'], [2, 'b']]) put(px, cx + dx, y, color)
    }
    // Two fists: one pulls up with the chain while the other reaches down.
    const a = Math.round(24 - (step < 4 ? step : 8 - step) * 2)
    const b = Math.round(16 + (step < 4 ? step : 8 - step) * 2)
    stamp(px, FIST, 30, b)
    sleeve(px, 29, a + 4, 10)
    stamp(px, FIST, 29, a)
    // Sweat.
    if (t >= 2 && t <= 7) {
      put(px, AT + 7, 13 + (t - 2), 'u')
      put(px, AT + 7, 14 + (t - 2), 'm')
    }
    return px
  }
  return Array.from({ length: 16 }, (_, t) => hold(pose(t), 2))
}

/** The film: two-coloured glasses, the light of the screen on him, and popcorn. */
function play() {
  const pose = ({ t, lips = 'flat', hand = null, isLit = 1 }) => {
    let px = dante({ lips, lids: 'open', brows: lips === 'open' ? 'up' : 'level' })
    // The screen he is looking at lights him, brighter and dimmer.
    const colors = [rgb('#9FD4FF'), rgb('#FFE2B0'), rgb('#C9B8FF'), rgb('#FFFFFF')]
    px = lit(px, { x: 15, y: 40, reach: 44, color: colors[Math.floor(t / 3) % colors.length], dark: 0.6 + 0.12 * isLit, most: 0.3 * isLit })
    // The glasses.
    for (let x = 5; x <= 24; x++) put(px, AT + x, 16, 'K')
    for (const [from, color, shine] of [[8, 'x', 'H'], [17, 'y', 'm']]) {
      for (let y = 16; y <= 20; y++) {
        for (let x = from - 1; x <= from + 5; x++) {
          const isRim = y === 16 || y === 20 || x === from - 1 || x === from + 5
          put(px, AT + x, y, isRim ? 'K' : color)
        }
      }
      const glide = (t * 2) % 5
      for (const [dx, dy] of [[0, 0], [-1, 1], [-2, 2]]) if (glide + dx >= 0 && glide + dx < 5) put(px, AT + from + glide + dx, 17 + dy, shine)
    }
    // The bucket.
    for (let y = 23; y < 32; y++) {
      const inset = Math.floor((y - 23) / 4)
      for (let x = 23 + inset; x <= 36 - inset; x++) {
        const isEdge = x === 23 + inset || x === 36 - inset || y === 23
        put(px, x, y, isEdge ? 'K' : Math.floor((x - 24) / 2) % 2 ? 'E' : 'x')
      }
    }
    for (let x = 24; x <= 35; x++) {
      const tall = 2 + Math.round(noise(x, 9) * 2) - (Math.abs(x - 29.5) > 4 ? 1 : 0)
      for (let k = 0; k < tall; k++) put(px, x, 22 - k, noise(x, k, 4) > 0.6 ? 'J' : noise(x, k, 5) > 0.8 ? 'w' : 'j')
    }
    if (hand !== null) {
      const [hx, hy, isFull] = hand
      stamp(px, PINCH, hx, hy)
      if (isFull) for (const [dx, dy, color] of [[1, -1, 'j'], [2, -2, 'J'], [3, -1, 'j'], [2, -1, 'm']]) put(px, hx + dx, hy + dy, color)
    }
    return px
  }
  const scene = [
    { lips: 'flat', hand: null },
    { lips: 'flat', hand: null },
    { lips: 'flat', hand: [27, 17] },
    { lips: 'flat', hand: [26, 18] },
    { lips: 'flat', hand: [25, 17, true] },
    { lips: 'o', hand: [22, 20, true] },
    { lips: 'open', hand: [19, 24, true] },
    { lips: 'open', hand: [18, 25] },
    { lips: 'chew', hand: [22, 23] },
    { lips: 'chew2', hand: null },
    { lips: 'chew', hand: null },
    { lips: 'chew2', hand: null },
    { lips: 'chew', hand: null },
    { lips: 'smile', hand: null },
    { lips: 'smile', hand: null },
    { lips: 'smile', hand: null },
  ]
  return scene.map((one, t) => hold(pose({ t, ...one, isLit: [1, 0.8, 1, 0.5, 0.9, 1][t % 6] }), 2))
}

const SOOT = { S: 'Z', s: 'z', h: 'v', t: 'z', W: 'v', w: 'Z', L: 'z', M: 'Z', l: 'K', G: 'C', Y: 'C', g: 'K' }
/** The same face, blackened by smoke. */
function sooted(px) {
  const from = Object.keys(SOOT).map(key => [C[key], C[SOOT[key]]])
  return px.map((old, n) => {
    const x = (n % W) - AT
    const y = Math.floor(n / W)
    if (old === CLEAR || y > 28 || noise(x, y, 11) > 0.95) return old
    return from.find(([a]) => a === old)?.[1] ?? old
  })
}

function smoke(px, t, x, y) {
  for (let n = 0; n < 4; n++) {
    const rise = t * 1.4 + n * 3
    const fade = rise > 9
    if (rise > 13) continue
    const cx = Math.round(x + Math.sin(rise / 2 + n) * 2)
    const cy = Math.round(y - rise)
    const size = fade ? 1 : 2
    for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) if (Math.abs(dx) + Math.abs(dy) <= size) put(px, cx + dx, cy + dy, fade ? 'Z' : dx + dy < 0 ? 'V' : 'v')
  }
}

/** It went wrong: the laurel catches fire, he screams, and it leaves him black with soot. */
function burn() {
  const alight = (t, size, face) => {
    let px = dante({ lids: 'wide', brows: 'up', lips: 'scream', dip: t % 2, ...face })
    px = lit(px, { x: 16, y: 6, reach: 30, color: C[5], dark: 0.6, most: 0.35 })
    for (const [x, wide, tall] of [[7, 7, 7], [12, 7, 9], [17, 9, 12], [22, 7, 9], [27, 7, 7]]) flame(px, x, 11 + (t % 2), wide, Math.round(tall * size), t * 5 + x)
    return px
  }
  const black = (face, t = -1) => {
    const px = sooted(dante({ brows: 'sad', lips: 'flat', ...face }))
    if (t >= 0) {
      smoke(px, t, 11, 8)
      smoke(px, t + 1, 22, 7)
    }
    return px
  }
  return [
    hold(dante({ look: [0, -1], brows: 'one' }), 2),
    hold(alight(0, 0.35, { lids: 'open', look: [0, -1], lips: 'flat' })),
    hold(alight(1, 0.55, { lips: 'o' })),
    ...Array.from({ length: 10 }, (_, n) => hold(alight(n + 2, 1, { look: [n % 4 < 2 ? -1 : 1, 0] }))),
    hold(alight(12, 0.5, {})),
    hold(black({ lids: 'wide', lips: 'o' }, 0)),
    ...[1, 2, 3, 4].map(t => hold(black({ lids: 'wide', lips: 'o' }, t))),
    ...[5, 6].map(t => hold(black({ lids: 'closed', lips: 'flat' }, t))),
    hold(black({ lids: 'open' }), 4),
  ]
}

/** After it: he stands there, blackened. He blinks, coughs, and looks at you. */
function soot() {
  const black = (face, t = -1, dip = 0) => {
    const px = sooted(dante({ brows: 'sad', lips: 'flat', dip, ...face }))
    if (t >= 0) smoke(px, t, AT + 27, 24)
    return px
  }
  return [
    hold(black({})),
    hold(black({ lids: 'half' })),
    hold(black({ lids: 'closed' }), 2),
    hold(black({}), 4),
    hold(black({ lids: 'tight', lips: 'o' }, 0, 1)),
    hold(black({ lids: 'tight', lips: 'o' }, 1)),
    hold(black({ lids: 'closed' }, 2)),
    ...[3, 4, 5].map(t => hold(black({ lids: 'half' }, t))),
    hold(black({ look: [-1, 0] }), 5),
    hold(black({ look: [1, 0] }), 5),
    hold(black({}), 2),
  ]
}

/** Out to see the stars: the laurel turns to gold, he smiles, and winks. */
function stars() {
  const sky = [[35, 4], [33, 12], [36, 20], [1, 3], [31, 1], [0, 12], [34, 27]]
  const pose = (t, face) => {
    const px = dante({ brows: 'soft', lips: 'smile', isGold: t > 2, glint: t < 9 ? t : t - 9, ...face })
    sky.forEach(([x, y], n) => {
      const phase = (t + n * 3) % 8
      if (t > n && phase < 5 && at(px, x, y) === CLEAR) spark(px, x, y, phase === 2 ? 2 : phase === 1 || phase === 3 ? 1 : 0, phase === 2 ? 'm' : n % 2 ? 'Y' : 'k')
    })
    return px
  }
  const face = t => (t < 2 ? { look: [0, -1], brows: 'up', lips: 'flat' } : t < 5 ? { look: [0, -1], brows: 'up' } : t < 13 ? { lids: 'happy' } : t < 17 ? {} : { lids: 'wink' })
  return Array.from({ length: 22 }, (_, t) => hold(pose(t, face(t)), 2))
}

const ACTS = { idle, ponder, verse, title, search, cache, add, play, burn, soot, stars }

// ---------------------------------------------------------------- PNG

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = bytes => {
  let c = 0xffffffff
  for (const x of bytes) c = crcTable[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, sum])
}
function png(width, height, buf) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) buf.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function paint(buf, width, px, left, top, scale, columns = W, from = 0) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < columns; x++) {
      const color = px[y * W + x + from]
      if (color === CLEAR) continue
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) buf.set([...color, 255], ((top + y * scale + j) * width + left + x * scale + i) * 4)
    }
  }
}

// ---------------------------------------------------------------- files

const art = join(root, 'plugin', 'art', 'dante')
rmSync(art, { recursive: true, force: true })
const width = COLUMNS * CELL.width * DENSITY
const height = ROWS * CELL.height * DENSITY
const timing = {}
const sheet = []
for (const [name, act] of Object.entries(ACTS)) {
  mkdirSync(join(art, name), { recursive: true })
  const known = new Map()
  timing[name] = []
  const frames = act()
  sheet.push(frames)
  for (const { px, beats } of frames) {
    const same = JSON.stringify(px)
    if (!known.has(same)) {
      const buf = Buffer.alloc(width * height * 4)
      paint(buf, width, px, 0, 0, PIXEL * DENSITY)
      writeFileSync(join(art, name, `${String(known.size).padStart(2, '0')}.png`), png(width, height, buf))
      known.set(same, known.size)
    }
    timing[name].push([known.get(same), beats])
  }
  console.log(`${name}: ${known.size} pictures, ${timing[name].reduce((sum, [, beats]) => sum + beats, 0) / 10} s`)
}
writeFileSync(
  join(root, 'plugin', 'hooks', 'acts.ts'),
  `// Written by scripts/draw-dante.mjs; do not edit. Each act is what it shows, in order: which picture
// of plugin/art/dante/<act>/ and for how many beats.
export const PORTRAIT = { columns: ${COLUMNS}, rows: ${ROWS} } as const

export const ACTS = {
${Object.entries(timing).map(([name, shown]) => `  ${name}: [${shown.map(([picture, beats]) => `[${picture}, ${beats}]`).join(', ')}],`).join('\n')}
} as const satisfies Record<string, readonly (readonly [picture: number, beats: number])[]>

export type ActName = keyof typeof ACTS
`,
)

// The listing icon: him on a dark ember disc with a gold ring.
const SIZE = 512
const icon = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2)
    if (d <= SIZE / 2 - 4) icon.set([...(d > SIZE / 2 - 16 ? [212, 162, 76] : [26, 14, 11]), 255], (y * SIZE + x) * 4)
  }
}
paint(icon, SIZE, dante(), (SIZE - 330) / 2, (SIZE - 352) / 2, 11, 30, AT)
mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true })
writeFileSync(join(root, 'plugin', '.claude-plugin', 'icon.png'), png(SIZE, SIZE, icon))

// Every frame side by side, to look at.
const to = process.argv.indexOf('--sheet')
if (to > 0) {
  const only = process.argv[to + 2]
  const rows = only === undefined ? sheet : Object.keys(ACTS).flatMap((name, n) => (only.split(',').includes(name) ? [sheet[n]] : []))
  const scale = only === undefined ? 2 : 5
  const across = only === undefined ? Math.max(...rows.map(frames => frames.length)) : 8
  const cells = rows.flatMap(frames => {
    const lines2 = []
    for (let n = 0; n < frames.length; n += across) lines2.push(frames.slice(n, n + across))
    return lines2
  })
  const [bw, bh] = [(W + 2) * scale * across, (H + 2) * scale * cells.length]
  const buf = Buffer.alloc(bw * bh * 4)
  for (let n = 0; n < bw * bh; n++) buf.set([20, 12, 10, 255], n * 4)
  cells.forEach((frames, y) => frames.forEach(({ px }, x) => paint(buf, bw, px, x * (W + 2) * scale, y * (H + 2) * scale, scale)))
  writeFileSync(process.argv[to + 1], png(bw, bh, buf))
}
