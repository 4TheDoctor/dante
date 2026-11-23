// Dante's Inferno as pixel art: nine circles in a cut-away pit, fire on the ledges, Dante and
// Virgil walking down, ice at the bottom, and the stars at the end ("e quindi uscimmo a riveder
// le stelle"). Pure: pixels in, pixels out. No Claude Code imports, so it can be tested and
// previewed outside it. One terminal cell holds two pixels (▀: foreground above, background below).

export type Mood = 'idle' | 'running' | 'done' | 'failed'

export interface View {
  /** 0 = first circle … 8 = ninth. A fraction is the way down to the next one. */
  depth: number
  mood: Mood
  /** Seconds, for the animation. */
  t: number
  /** 0 = the pit, 1 = the starry sky; in between the pit dissolves. */
  stars: number
}

interface Ring {
  /** Front line of the ledge. */
  y: number
  /** Half width of the pit at this ledge (outer) and just below it (inner). */
  outer: number
  inner: number
  /** How far back the ledge curves. */
  bow: number
}

export interface Scene {
  w: number
  h: number
  cx: number
  rings: Ring[]
  /** The still picture: rock, walls and ledges, as palette indexes. */
  base: Uint8Array
  sky: Uint8Array
}

export const CIRCLES = 9

const C = {
  void: 0, rock1: 1, rock2: 2, rock3: 3, rock4: 4, wall1: 5, wall2: 6, wall3: 7, ember: 8, orange: 9,
  yellow: 10, pale: 11, gold: 12, goldLight: 13, ice1: 14, ice2: 15, ice3: 16, ice4: 17, skin: 18,
  robeDark: 19, white: 20, toga: 21, laurel: 22, night1: 23, night2: 24, night3: 25, dawn1: 26,
  dawn2: 27, star: 28, starDim: 29, hill: 30, ash: 31,
} as const

/** Few colours on purpose: it is pixel art, and the terminal keeps 1024 colour pairs at a time. */
export const PALETTE: readonly number[] = [
  0x0b0605, 0x170c09, 0x24120e, 0x351a13, 0x4c261b, 0x43100e, 0x661914, 0x8c2719, 0xd03a2a, 0xef6a2e,
  0xf7b53c, 0xffe9a8, 0xb8862f, 0xf2cb7a, 0x12283d, 0x275878, 0x68acd0, 0xd8f0fa, 0xe8be90,
  0x8e2418, 0xf3e7d3, 0xbfae98, 0x8fb65a, 0x070b1e, 0x0e1636, 0x1b2752, 0x5a3a6b,
  0xb8605a, 0xffffff, 0x8fa0d0, 0x0a0a14, 0x2b201e,
]

/** Wall colour of each circle, lit and in shade: earth, then blood, then ice. */
const WALLS: ReadonlyArray<readonly [number, number]> = [
  [C.rock4, C.rock3], [C.rock4, C.rock3], [C.wall1, C.rock3], [C.wall2, C.wall1], [C.wall2, C.wall1],
  [C.wall3, C.wall2], [C.wall3, C.wall2], [C.wall2, C.wall1], [C.ice2, C.ice1],
]

/** A steady pseudo-random number in [0, 1) for a pixel and a tick. */
export function noise(x: number, y: number, n: number): number {
  let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dither = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16

/** Lay out and paint everything that does not move, for a canvas of w x h pixels. */
export function makeScene(w: number, h: number): Scene {
  const cx = (w - 1) / 2
  const top = Math.max(9, Math.round(h * 0.11))
  const step = (h - top - 3) / CIRCLES
  const widest = w / 2 - 1.5
  const narrowest = Math.max(4.5, w * 0.13)
  const halfWidth = (i: number) => widest + ((narrowest - widest) * i) / CIRCLES
  const rings: Ring[] = []
  for (let i = 0; i < CIRCLES; i++) {
    const outer = halfWidth(i)
    rings.push({ y: Math.round(top + step * (i + 1)), outer, inner: halfWidth(i + 1), bow: Math.max(2, Math.min(5, step * 0.42) * (outer / widest) + 0.6) })
  }

  const base = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) base[y * w + x] = rockAt(x, y, w, h, cx, top, rings)
  }
  return { w, h, cx, rings, base, sky: paintSky(w, h) }
}

function rockAt(x: number, y: number, w: number, h: number, cx: number, top: number, rings: Ring[]): number {
  const dx = Math.abs(x - cx)
  // Above the pit: the dark wood under a black sky.
  if (y < top) {
    const ground = top - 3
    if (y >= ground) return noise(x, y, 1) < 0.25 ? C.rock2 : C.rock1
    const tree = Math.floor(x / 4)
    const tall = 3 + Math.floor(noise(tree, 7, 2) * Math.max(2, ground - 3))
    const inGate = dx < 5
    if (!inGate && noise(tree, 3, 3) > 0.22) {
      const mid = tree * 4 + 1.5
      const fromGround = ground - y
      if (fromGround <= tall) {
        const spread = fromGround <= 1 ? 0.6 : (1 - fromGround / (tall + 1)) * 2.2
        if (Math.abs(x - mid) <= spread) return C.rock2
      }
    }
    // The gate: two posts and a lintel.
    if (dx < 5 && y >= ground - 6) {
      if (y <= ground - 5) return C.rock4
      if (dx >= 3) return dx >= 4 ? C.rock3 : C.rock4
      return C.void
    }
    return C.void
  }

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!
    if (y > ring.y) continue
    // The ledge: the far half of an ellipse ring, curving back and up from its front line.
    const up = ring.y - y
    const outer = (dx / ring.outer) ** 2 + (up / ring.bow) ** 2
    const inner = (dx / ring.inner) ** 2 + (up / Math.max(1, ring.bow * (ring.inner / ring.outer))) ** 2
    if (up <= ring.bow && outer <= 1) {
      if (inner <= 1) return i + 1 < rings.length ? C.void : C.ice1
      return i === rings.length - 1 ? C.ice2 : up === 0 ? C.rock4 : C.rock3
    }
    if (dx <= ring.outer) {
      const [lit, shade] = WALLS[i]!
      const edge = dx / ring.outer
      if (edge > 0.86) return C.rock1
      return edge + (dither(x, y) - 0.5) * 0.35 > 0.55 ? shade : lit
    }
    // The rock the pit is cut in, with strata.
    const strata = (y + Math.floor(noise(x >> 2, i, 5) * 2)) % 5 === 0
    const grain = noise(x, y, 9)
    return strata ? C.rock2 : grain < 0.1 ? C.rock3 : grain < 0.35 ? C.rock2 : C.rock1
  }
  return noise(x, y, 11) < 0.2 ? C.rock2 : C.rock1
}

function paintSky(w: number, h: number): Uint8Array {
  const sky = new Uint8Array(w * h)
  const horizon = Math.round(h * 0.8)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = y / horizon + (dither(x, y) - 0.5) * 0.18
      let c: number = v < 0.35 ? C.night1 : v < 0.65 ? C.night2 : v < 0.86 ? C.night3 : v < 0.95 ? C.dawn1 : C.dawn2
      // The mountain of Purgatory, to the right, and the shore.
      const peakX = w * 0.68
      const slope = horizon - h * 0.34 + Math.abs(x - peakX) * (h / w) * 0.62
      const terrace = Math.max(3, Math.round((horizon - h * 0.46) / 7))
      if (y >= slope && y >= h * 0.4) c = (horizon - y) % terrace === 0 ? C.ash : C.hill
      if (y >= horizon) c = noise(x, y, 4) < 0.12 ? C.rock2 : C.hill
      sky[y * w + x] = c
    }
  }
  return sky
}

// Sprites, one letter per pixel.
const LETTERS: Record<string, number> = {
  R: C.ember, r: C.robeDark, S: C.skin, G: C.goldLight, L: C.laurel, W: C.white, w: C.toga, K: C.void,
}
const DANTE = [
  ['.LGL.', '.RRR.', '.RSS.', '.RRS.', 'RRRR.', 'RRRR.', '.R.r.'],
  ['.LGL.', '.RRR.', '.RSS.', '.RRS.', 'RRRR.', 'RRRR.', '..Rr.'],
]
const VIRGIL = [
  ['.LL.', '.SS.', '.WW.', 'WWW.', 'WWw.', 'WWw.', 'W.w.'],
  ['.LL.', '.SS.', '.WW.', 'WWW.', 'WWw.', 'WWw.', '.Ww.'],
]

function sprite(px: Uint8Array, w: number, h: number, art: string[], x: number, foot: number, faceRight: boolean): void {
  const top = foot - art.length + 1
  const each = (paint: (X: number, Y: number, color: number) => void) => {
    for (let j = 0; j < art.length; j++) {
      const row = art[j]!
      for (let i = 0; i < row.length; i++) {
        const color = LETTERS[row[faceRight ? i : row.length - 1 - i]!]
        if (color !== undefined) paint(x + i - (row.length >> 1), top + j, color)
      }
    }
  }
  const put = (X: number, Y: number, color: number) => {
    if (X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
  }
  // A dark outline first, so the figures read against the fire.
  each((X, Y) => {
    put(X - 1, Y, C.void)
    put(X + 1, Y, C.void)
    put(X, Y - 1, C.void)
  })
  each(put)
}

/** A point of a ledge: 0 = its left end, 1 = its right end, going round the back. */
function onLedge(scene: Scene, i: number, along: number): { x: number; y: number } {
  const ring = scene.rings[i]!
  const angle = Math.PI * (1 - along)
  const radius = (ring.outer + ring.inner) / 2
  return { x: Math.round(scene.cx + radius * Math.cos(angle)), y: Math.round(ring.y - ring.bow * 0.55 * Math.sin(angle)) }
}

/** Where a walker is on its way down, pacing the ledge while it works. */
function walker(scene: Scene, depth: number, t: number, lag: number, moves: boolean): { x: number; y: number; right: boolean } {
  const i = Math.max(0, Math.min(CIRCLES - 1, Math.floor(depth)))
  const down = depth - i
  // Each ledge is entered from the side the last one was left by.
  const pace = moves ? (Math.sin(t * 0.8 - lag) + 1) / 2 : 0.5 - lag * 0.06
  const here = onLedge(scene, i, 0.22 + 0.56 * pace)
  if (down <= 0.001 || i === CIRCLES - 1) return { ...here, right: moves ? Math.cos(t * 0.8 - lag) > 0 : true }
  const next = onLedge(scene, i + 1, 0.22 + 0.56 * pace)
  return { x: Math.round(here.x + (next.x - here.x) * down), y: Math.round(here.y + (next.y - here.y) * down), right: next.x >= here.x }
}

const FLAME = [C.pale, C.yellow, C.orange, C.ember, C.wall3] as const

/** Tongues of fire standing on a ledge. `heat` 0 to 1 sets how tall and how many. */
function burn(scene: Scene, px: Uint8Array, i: number, heat: number, t: number): void {
  const { w, h } = scene
  const ring = scene.rings[i]!
  const tick = Math.floor(t * 9)
  const span = Math.max(4, Math.round(ring.outer * 2.4))
  for (let n = 0; n <= span; n++) {
    if (noise(n, i, 21) > 0.35 + heat * 0.5) continue
    const at = onLedge(scene, i, n / span)
    const sway = noise(n, i, tick >> 1) < 0.3 ? (noise(n, i, tick) < 0.5 ? -1 : 1) : 0
    const tall = Math.round((0.6 + noise(n, i + 31, tick) * 1.4) * (1 + heat * 3.2))
    for (let k = 0; k < tall; k++) {
      const x = at.x + (k > 1 ? sway : 0)
      const y = at.y - k
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      px[y * w + x] = FLAME[Math.min(FLAME.length - 1, Math.floor((k / tall) * FLAME.length + (heat < 0.4 ? 1.4 : 0)))]!
    }
  }
}

/** One frame of the scene, as palette indexes. */
export function draw(scene: Scene, view: View): Uint8Array {
  const { w, h } = scene
  const pit = view.stars < 1 ? drawPit(scene, view) : undefined
  if (view.stars <= 0) return pit!
  const sky = drawSky(scene, view)
  if (!pit) return sky
  // The pit dissolves into the sky, from the top down.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (dither(x, y) * 0.5 + (y / h) * 0.5 < view.stars) pit[k] = sky[k]!
    }
  }
  return pit
}

function drawPit(scene: Scene, view: View): Uint8Array {
  const { w, h, rings } = scene
  const px = scene.base.slice()
  const here = Math.max(0, Math.min(CIRCLES - 1, Math.floor(view.depth)))
  const tick = Math.floor(view.t * 6)

  // Circles already crossed keep a gold edge; the one Dante is in glows.
  for (let i = 0; i < CIRCLES; i++) {
    const ring = rings[i]!
    if (i >= here && !(i === here && view.mood !== 'idle')) continue
    for (let n = 0; n <= ring.outer * 4; n++) {
      const angle = (Math.PI * n) / (ring.outer * 4)
      const x = Math.round(scene.cx + ring.inner * Math.cos(angle))
      const y = Math.round(ring.y - ring.bow * (ring.inner / ring.outer) * Math.sin(angle))
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      px[y * w + x] = i < here ? C.gold : view.mood === 'failed' ? C.ember : C.goldLight
    }
  }

  // Fire on the ledges: embers everywhere, a blaze where the work is. The ninth is ice.
  for (let i = 0; i < CIRCLES - 1; i++) {
    const near = Math.max(0, 1 - Math.abs(i - view.depth) / 2.2)
    const heat = view.mood === 'failed' ? 0.5 + near * 0.5 : view.mood === 'running' ? 0.1 + near * 0.9 : 0.08 + near * 0.3
    burn(scene, px, i, heat, view.t)
  }
  const lake = rings[CIRCLES - 1]!
  for (let n = 0; n < 10; n++) {
    const x = Math.round(scene.cx + (noise(n, 1, tick >> 2) - 0.5) * 2 * lake.outer * 0.9)
    const y = lake.y - Math.floor(noise(n, 2, tick >> 2) * lake.bow)
    if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = n % 3 === 0 ? C.ice4 : C.ice3
  }

  // Sparks rising out of the pit.
  for (let n = 0; n < Math.round(h / 8); n++) {
    const speed = 3 + noise(n, 5, 1) * 7
    const life = (view.t * speed + noise(n, 6, 1) * h) % h
    const y = h - 1 - Math.floor(life)
    const x = Math.round(scene.cx + (noise(n, 8, 1) - 0.5) * w * 0.7 + Math.sin(view.t * 2 + n) * 1.5)
    if (y < 1 || x < 0 || x >= w) continue
    if (view.mood === 'idle' && n % 3 !== 0) continue
    const under = scene.base[y * w + x]!
    if (under === C.rock1 || under === C.rock2 || under === C.rock3) continue
    px[y * w + x] = y < h * 0.3 ? C.wall3 : y < h * 0.6 ? C.ember : C.orange
  }

  const moves = view.mood === 'running'
  const step = moves || view.depth % 1 > 0.001 ? Math.floor(view.t * 5) % 2 : 0
  const guide = walker(scene, view.depth, view.t, 0, moves)
  const dante = walker(scene, view.depth, view.t, 0.55, moves)
  // Virgil leads; the two never stand on each other.
  if (Math.abs(dante.x - guide.x) < 7) dante.x = guide.x + (guide.right ? -7 : 7)
  sprite(px, w, h, VIRGIL[step]!, guide.x, guide.y, guide.right)
  sprite(px, w, h, DANTE[step]!, dante.x, dante.y, dante.right)
  return px
}

function drawSky(scene: Scene, view: View): Uint8Array {
  const { w, h } = scene
  const px = scene.sky.slice()
  const horizon = Math.round(h * 0.8)
  const count = Math.round((w * h) / 45)
  for (let n = 0; n < count; n++) {
    const x = Math.floor(noise(n, 1, 77) * w)
    const y = Math.floor(noise(n, 2, 77) ** 1.3 * horizon * 0.8)
    const c = px[y * w + x]!
    if (c !== C.night1 && c !== C.night2 && c !== C.night3) continue
    const beat = Math.sin(view.t * (0.8 + noise(n, 3, 77) * 2) + n)
    if (beat < -0.6) continue
    px[y * w + x] = beat > 0.35 ? C.star : C.starDim
    // The four stars Dante sees first are bigger.
    if (n < 4 && beat > 0) {
      for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const X = x + i
        const Y = y + j
        if (X >= 0 && X < w && Y >= 0 && Y < horizon) px[Y * w + X] = C.starDim
      }
    }
  }
  const foot = Math.min(h - 2, horizon + 2)
  sprite(px, w, h, VIRGIL[0]!, Math.round(w * 0.3), foot, true)
  sprite(px, w, h, DANTE[0]!, Math.round(w * 0.3) - 6, foot, true)
  return px
}

/** The burning rule under the header: one cell tall, two pixels. `heat` 0 is glowing coals. */
export function drawRule(w: number, t: number, heat: number): Uint8Array {
  const px = new Uint8Array(w * 2)
  const tick = Math.floor(t * 9)
  for (let x = 0; x < w; x++) {
    const glow = noise(x >> 1, 1, tick >> 2)
    px[w + x] = glow < 0.2 ? C.robeDark : glow < 0.65 ? C.ember : glow < 0.9 ? C.orange : C.yellow
    const tongue = noise(x, 2, tick)
    px[x] = tongue < heat * 0.55 ? (tongue < heat * 0.12 ? C.yellow : tongue < heat * 0.3 ? C.orange : C.ember) : C.void
  }
  return px
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (native !== undefined) return native.call(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!
    out += c === undefined ? '=' : ALPHABET[c & 63]!
  }
  return out
}

const UPPER_HALF = 0x2580

/** Pixels to a terminal Raster's cells: each cell an upper half block, two pixels. `h` is even. */
export function toCells(px: Uint8Array, w: number, h: number): string {
  const rows = h >> 1
  const bytes = new Uint8Array(w * rows * 12)
  const view = new DataView(bytes.buffer)
  let at = 0
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < w; x++) {
      view.setUint32(at, UPPER_HALF, true)
      view.setUint32(at + 4, PALETTE[px[row * 2 * w + x]!]!, true)
      view.setUint32(at + 8, PALETTE[px[(row * 2 + 1) * w + x]!]!, true)
      at += 12
    }
  }
  return base64(bytes)
}
