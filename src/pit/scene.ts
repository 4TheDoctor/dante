// The high-resolution Inferno of downloads: nine circles in a cut-away pit, lit by simulated fire,
// from the catalogue down to the player. Dante and his robot guide wait before the gate, cross the
// torrent, walk the ledges and climb down as the request really advances, and come out to a film
// under the stars when it is done. Pixels are palette indexes (palette.ts).
import { pixelLogo, type Logo, type Picture } from './logo.js'
import { FLAME, inkLogo, LEVELS, LOGO, RAMP, SPOT, type RampName } from './palette.js'
import { capitals, CAR, CRATE, DANTE, DANTE_DOWN, DOWN, FERRYMAN, FILE, FOSSILS, POPCORN, REEL, stamp, textWidth, UP, VIRGIL, VIRGIL_DOWN, WARNING, wrap, write, writeBig, type Canvas } from './sprites.js'
import { SMALL_SIZE, smallWordmark } from './wordmark.js'

export type Mood = 'idle' | 'running' | 'done' | 'failed'

/** What is cut in the rock: all of it comes from the request itself. */
export interface Labels {
  /** The nine circles, top to bottom. */
  circles: readonly string[]
  /** What is being looked for: on the screen, at the end. */
  title: string
  /** What to write under the film's logo, where there is one: "S03E06". */
  caption?: string
  /** What each of the five steps found: results, cache, download… Empty until it has. */
  facts: readonly string[]
  /** Which of the five steps are done, and which one is under way (-1: none). */
  lit: readonly boolean[]
  now: number
  /** Why it stopped, on the sign, when it did. */
  reason?: string
  /** The same numbers as they come, for what they move in the picture. */
  results?: number
  checked?: number
  cached?: number
  /** Of the download, 0 to 100. */
  percent?: number
}

export interface Goal {
  /** -1 = before the gate; 0 = first circle … 8 = ninth; a fraction is the way down to the next. */
  depth: number
  mood: Mood
  /** The request is finished: out to see the stars. */
  isDone: boolean
}

export const CIRCLES = 9
const LAST = CIRCLES - 1
/** How fast the world around them moves. */
const CALM = 0.55
/** Seconds between two steps of the fire. */
const FIRE_BEAT = 0.11
const LETTERS = ['D', 'A', 'N', 'T', 'E']
const NO_LABELS: Labels = { circles: [], title: '', facts: [], lit: [], now: -1 }
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const WALL: readonly RampName[] = ['earth', 'blood', 'earth', 'stone', 'bog', 'fire', 'blood', 'fire', 'ice']
const FIREWALL = 5
const FLAME_OF = [1, 0, 0, 0, 0, 0, 0, 0, 2]
/** The name over the gate, and the ink of each of its tones. */
const SIGN = smallWordmark()
const SIGN_INK = [0, SPOT.robeLight, SPOT.robe, SPOT.robe, RAMP.blood + 5, SPOT.robeDark, RAMP.blood + 3, SPOT.laurel, SPOT.laurelDark, SPOT.laurelGold, RAMP.gold + 5] as const

interface Ring {
  /** Front line of the ledge. */
  y: number
  /** Half widths: of the room, and of the hole the next room is seen through. */
  outer: number
  hole: number
  /** How far back the ledge curves, and the edge of the hole in it: the floor lies between. */
  bow: number
  rim: number
  /** Height of the room above the ledge. */
  tall: number
}

/** A steady pseudo-random number in [0, 1). */
export function noise(x: number, y: number, n: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(n, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number): number => t * t * (3 - 2 * t)
/** Value noise: noise without the grain. */
export function cloud(x: number, y: number, n: number): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  const u = smooth(x - i)
  const v = smooth(y - j)
  const a = noise(i, j, n) * (1 - u) + noise(i + 1, j, n) * u
  const b = noise(i, j + 1, n) * (1 - u) + noise(i + 1, j + 1, n) * u
  return a * (1 - v) + b * v
}

/** Cells like stones: how close to a seam (0 = on it), and a number of the stone's own. */
function stones(x: number, y: number, size: number, stretch: number, n: number): { seam: number; id: number } {
  const X = x / size
  const Y = y / (size * stretch)
  const i = Math.floor(X)
  const j = Math.floor(Y)
  let best = 9
  let second = 9
  let id = 0
  for (let b = -1; b <= 1; b++) {
    for (let a = -1; a <= 1; a++) {
      const cx = i + a + noise(i + a, j + b, n)
      const cy = j + b + noise(i + a, j + b, n + 1)
      const d = Math.hypot(X - cx, Y - cy)
      if (d < best) {
        second = best
        best = d
        id = noise(i + a, j + b, n + 2)
      } else if (d < second) second = d
    }
  }
  return { seam: second - best, id }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

interface Step {
  x: number
  y: number
  right: boolean
}

const FIRE_ROWS = 26
/** Share of the way to the first circle that is the river. */
const CROSSED = 0.8
/** And the part before it, through the gate. */
const BOARDED = 0.24
/** Hottest value of the fire simulation. */
const HOTTEST = 36
const DISTANCES = 64

/** The picture and what moves in it. One per size; `frame` moves it on and paints it. */
export class Pit {
  readonly rings: Ring[] = []
  readonly top: number
  /** Where the dark wood ends and the Acheron begins. */
  private readonly bank: number
  labels: Labels = NO_LABELS
  private readonly cx: number
  // What each pixel is made of, how light it is unlit (in 16ths of a level), and which fire lights it.
  private readonly ramp: Uint8Array
  private readonly level: Int16Array
  private readonly lit: Int8Array
  private readonly far: Uint8Array
  private readonly px: Uint8Array
  private readonly sky: Uint8Array
  private readonly skyPx: Uint8Array
  private readonly heat: Uint8Array[] = []
  private readonly warmth = new Float32Array(CIRCLES)
  private readonly sparks: Spark[] = []
  private seed = 0x9e3779b9
  private fireClock = 0
  /** How far into the alarm, 0 to 1, and the circle that set it off. */
  private alarm = 0
  private fault = -1
  t = 0
  stars = 0
  /** The logo of the film that is served, as it came and as it is shown. */
  private picture: Picture | undefined
  private logo: Logo | undefined
  private logoFor: boolean | undefined
  /** The sign over the gate: what its lamps light, and its board with each of them well or failing. */
  private halo: Array<{ k: number; by: number }> | undefined
  private readonly boards: Uint8Array[] = []
  // Where Virgil is; Dante walks where he has been.
  private ring = -1
  private along = 0.4
  private climb = 0
  private heading = 1
  private walked = 0
  private trail: Step[] = []

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cx = (w - 1) / 2
    this.top = Math.max(70, Math.round(h * 0.18))
    this.bank = this.top - 12
    const tall = (h - this.top - 10) / CIRCLES
    const widest = w * 0.42
    const narrowest = Math.max(20, w * 0.22)
    const half = (i: number): number => widest + ((narrowest - widest) * i) / LAST
    for (let i = 0; i < CIRCLES; i++) {
      const outer = half(i)
      this.rings.push({
        y: Math.round(this.top + tall * (i + 1)),
        outer,
        hole: i === LAST ? 0 : half(i + 1) + 1,
        bow: Math.max(7, Math.min(tall * 0.38, outer * 0.24)),
        rim: 0,
        tall,
      })
      const ring = this.rings[i]!
      ring.rim = i === LAST ? 0 : ring.bow * 0.42
      this.heat.push(new Uint8Array(w * FIRE_ROWS))
    }
    this.ramp = new Uint8Array(w * h)
    this.level = new Int16Array(w * h)
    this.lit = new Int8Array(w * h).fill(-1)
    this.far = new Uint8Array(w * h)
    this.px = new Uint8Array(w * h)
    this.skyPx = new Uint8Array(w * h)
    this.build()
    this.sky = this.paintSky()
  }

  private random(): number {
    let s = this.seed
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    this.seed = s
    return (s >>> 0) / 4294967296
  }

  // ---- the still picture ------------------------------------------------------------------

  private put(x: number, y: number, ramp: RampName, level: number, lit = -1, far = 0): void {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return
    const k = y * this.w + x
    this.ramp[k] = RAMP[ramp]
    this.level[k] = Math.round(level * 16)
    this.lit[k] = lit
    this.far[k] = Math.min(DISTANCES - 1, Math.max(0, Math.round(far)))
  }

  /** The back of a ledge at a distance from the middle. */
  private back(i: number, dx: number): number {
    const ring = this.rings[i]!
    const u = Math.min(1, Math.abs(dx) / ring.outer)
    return ring.y - ring.bow * Math.sqrt(1 - u * u)
  }

  /** The middle of a ledge's floor, where things stand. */
  private floorAt(i: number, dx: number): number {
    const ring = this.rings[i]!
    const u = Math.min(1, Math.abs(dx) / ring.outer)
    return Math.round(ring.y - (ring.bow * 0.5 + ring.rim * 0.5) * Math.sqrt(1 - u * u))
  }

  private build(): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (y >= this.bank && y < this.top) this.put(x, y, 'sea', 1.1 + cloud(x / 10, y / 2, 4) * 1.2 - (y - this.bank) * 0.06, 0, 44)
        else if (y < this.top) this.put(x, y, 'night', 0.9 - (y / this.top) * 0.9 + cloud(x / 9, y / 5, 3) * 0.7)
        else this.buildPit(x, y)
      }
    }
    this.buildBones()
    this.buildWood()
    this.buildGate()
    this.buildStairs()
  }

  private buildPit(x: number, y: number): void {
    const dx = x - this.cx
    const ax = Math.abs(dx)
    let i = this.rings.findIndex(ring => y <= ring.y)
    if (i < 0) i = LAST
    const ring = this.rings[i]!
    const up = ring.y - y
    const isBrick = i === FIREWALL
    const isOnLedge = up >= 0 && (ax / ring.outer) ** 2 + (up / ring.bow) ** 2 <= 1
    const isInHole = ring.hole > 0 && (ax / ring.hole) ** 2 + (up / ring.rim) ** 2 <= 1

    if (isOnLedge && isInHole) {
      // Through the hole: the top of the next room's wall, in the ledge's shadow.
      const curve = Math.sqrt(Math.max(0, 1 - (ax / ring.hole) ** 2))
      this.put(x, y, WALL[i + 1]!, 0.3 + curve * 0.9, i + 1, 26 + up)
      return
    }
    if (isOnLedge) {
      const grain = stones(x, y * 2.2, 7, 1, 40 + i)
      const front = 1 - up / ring.bow
      const ramp: RampName = i === LAST ? 'ice' : i === 4 ? 'bog' : 'stone'
      this.put(x, y, ramp, 2 + front * 1.3 + grain.id * 0.8 - (grain.seam < 0.1 ? 1 : 0), i, up * 0.6)
      return
    }
    if (y <= ring.y && ax <= ring.outer) {
      // The far wall of the room, rounding away from the light.
      const curve = Math.sqrt(Math.max(0, 1 - (ax / ring.outer) ** 2))
      const grain = stones(Math.asin(Math.min(1, ax / ring.outer)) * ring.outer * Math.sign(dx), y, 10, 0.75, 60 + i * 3)
      const roof = i === 0 ? this.top : this.rings[i - 1]!.y
      const shade = Math.max(0, 1 - (y - roof) / 9)
      const row = Math.floor(y / 4)
      const isMortar = isBrick && (y % 4 === 0 || (x + (row % 2) * 4) % 8 === 0)
      const brick = noise(Math.floor((x + (row % 2) * 4) / 8), row, 62)
      const crack = isBrick ? (isMortar ? 1.3 : -brick * 0.9) : grain.seam < 0.07 ? 1.2 : grain.seam < 0.14 ? 0.4 : 0
      this.put(x, y, WALL[i]!, (i === LAST ? 1.5 : 0.6) + curve * 1.5 + grain.id * 0.7 - crack - shade * 1.3, i, Math.max(0, this.back(i, dx) - y))
      return
    }
    // The rock the pit is cut in: big stones, seams, strata, and a little light at the edge.
    const grain = stones(x, y, 15, 0.7, 7)
    const strata = cloud(x / 26, y / 5, 8)
    const seam = grain.seam < 0.06 ? 1.1 : grain.seam < 0.12 ? 0.5 : 0
    const edge = Math.max(0, ax - ring.outer)
    const lip = y - (i > 0 ? this.rings[i - 1]!.y : this.top)
    // The cut edge of the ledge above.
    if (i > 0 && lip <= 4 && ax <= this.rings[i - 1]!.outer + 1 && ax >= ring.outer - 1) {
      this.put(x, y, 'stone', lip <= 1 ? 2.6 : 1.4 - lip * 0.2, i - 1, 10 + lip * 4)
      return
    }
    this.put(x, y, 'rock', 1.3 + grain.id * 1.4 + strata * 1 - seam, i, 18 + edge * 1.8)
  }

  /** What was saved and forgotten, shut in the rock: floppies, discs, cassettes. */
  private buildBones(): void {
    for (let n = 0; n < 34; n++) {
      const x = Math.floor(noise(n, 1, 25) * this.w)
      const y = this.top + 14 + Math.floor(noise(n, 2, 25) * (this.h - this.top - 20))
      const clear = this.rings.every(ring => Math.abs(y - ring.y) > ring.tall || Math.abs(x - this.cx) > ring.outer + (x > this.cx ? 26 : 18))
      if (!clear || x < 6 || x > this.w - 12) continue
      FOSSILS[n % FOSSILS.length]!.forEach((row, j) => {
        ;[...row].forEach((letter, i) => {
          if (letter !== '.') this.put(x + i - 3, y + j, 'rock', letter === '2' ? 1.2 : 3.2 - j * 0.12, -1)
        })
      })
    }
  }

  /** The dark wood: bare trees, and a dead antenna on each side of the gate. */
  private buildWood(): void {
    const ground = this.bank - 3
    for (let x = 0; x < this.w; x++) {
      const bump = Math.round(cloud(x / 7, 1, 12) * 2)
      for (let y = ground - bump; y < this.bank; y++) this.put(x, y, 'wood', 1.6 + noise(x, y, 13) * 1.3)
      this.put(x, this.bank, 'stone', 2.2 + noise(x, 2, 14) * 1.4)
    }
    const branch = (x: number, y: number, angle: number, length: number, thick: number, n: number): void => {
      const steps = Math.ceil(length)
      let X = x
      let Y = y
      let a = angle
      for (let s = 0; s < steps; s++) {
        a += (noise(n, s, 15) - 0.5) * 0.35
        X += Math.cos(a)
        Y += Math.sin(a)
        for (let k = 0; k < Math.max(1, Math.round(thick * (1 - (s / steps) * 0.6))); k++) {
          this.put(Math.round(X) + k, Math.round(Y), 'wood', k === 0 ? 3 : 1.9 - (k > 1 ? 0.8 : 0))
        }
        if (length > 6 && s > steps * 0.35 && noise(n, s, 16) < 0.2) {
          const side = noise(n, s, 17) < 0.5 ? -1 : 1
          branch(X, Y, a + side * (0.5 + noise(n, s, 18) * 0.6), length * 0.5, thick * 0.5, n * 7 + s)
        }
      }
    }
    for (const side of [-1, 1]) {
      const room = this.cx - 48
      const trees = Math.max(1, Math.floor(room / 13))
      for (let n = 0; n < trees; n++) {
        const x = Math.round(this.cx + side * (54 + n * 13 + noise(n, side + 2, 19) * 5))
        branch(x, ground, -Math.PI / 2 + (noise(n, side + 2, 20) - 0.5) * 0.3, ground * (0.55 + noise(n, side + 2, 21) * 0.35), 3, n * 13 + side * 5 + 40)
      }
    }
  }

  /** The gate: an arch, and over it, on two posts, the sign with the name. */
  private gate(): { ground: number; arch: number; sign: number; half: number; foot: number } {
    const ground = this.bank - 1
    const arch = ground - 24
    const sign = arch - 24
    return { ground, arch, sign, half: Math.min(42, (this.w >> 1) - 3), foot: sign + 22 }
  }

  private buildGate(): void {
    const cx = Math.round(this.cx)
    const { ground, arch, sign, half, foot } = this.gate()
    for (const side of [-1, 1]) {
      const post = cx + side * (half - 6)
      for (let y = foot; y <= ground; y++) for (let k = -1; k <= 1; k++) this.put(post + k, y, 'wood', k === -side ? 5.2 : k === 0 ? 3.6 : 2.4)
      // What holds it, from the post to the board.
      for (let k = 0; k < 6; k++) this.put(post - side * (k + 2), foot + 5 - k, 'wood', 3.8)
      for (let k = -2; k <= 2; k++) this.put(post + k, ground, 'stone', 3)
    }
    for (let y = arch; y <= ground; y++) {
      for (let x = cx - 24; x <= cx + 24; x++) {
        const ax = Math.abs(x - cx)
        const isOpen = ax < 13 && (y > arch + 13 || Math.hypot(ax, (y - arch - 14) * 1.2) < 13)
        if (isOpen) {
          // Firelight from below comes up through the door.
          this.put(x, y, 'fire', Math.max(0, (y - ground + 21) / 5), 0, 30)
          continue
        }
        if (ax > 21 && y < ground - 2) continue
        if (Math.hypot(ax, Math.max(0, arch + 14 - y) * 1.15) > 21.5 && y < ground - 2) continue
        // The stones of the arch lean on the one at its top.
        const isRing = Math.hypot(ax, Math.max(0, arch + 14 - y) * 1.15) < 17
        const block = stones(x, y, 6, 0.8, 23)
        const isKey = ax < 3 && y < arch + 4
        this.put(x, y, 'stone', (isKey ? 4.4 : isRing ? 3 : 2.1) + block.id * 1.2 - (block.seam < 0.12 && !isKey ? 1.1 : 0) - (ax > 18 ? 0.5 : 0), 0, isRing ? 34 : 40)
      }
    }
    for (let y = sign; y < foot; y++) {
      for (let x = cx - half; x <= cx + half; x++) {
        const isEdge = Math.abs(x - cx) === half || y === sign || y === foot - 1
        this.put(x, y, 'stone', isEdge ? 3 : 0.4)
      }
    }
  }

  /** Steps cut in the wall: right, then left, then right… from each ledge to the next. */
  private stairAlong(i: number): number {
    return i % 2 === 0 ? 0.84 : 0.16
  }

  /** The stretch of a ledge where they wait. */
  private waiting(i: number): [number, number] {
    return i % 2 === 0 ? [0.1, 0.24] : [0.76, 0.9]
  }

  /** Where the boat lands: the head of the stair down to the first circle. */
  private landing(): { x: number; y: number } {
    return { x: this.onLedge(0, 0.16).x + 2, y: this.top - 2 }
  }

  private buildStairs(): void {
    for (let i = -1; i < LAST; i++) {
      const from = i < 0 ? this.landing() : this.onLedge(i, this.stairAlong(i))
      const to = this.onLedge(i + 1, i < 0 ? 0.16 : this.stairAlong(i))
      const rise = to.y - from.y
      for (let s = 0; s <= rise; s++) {
        const x = Math.round(from.x + ((to.x - from.x) * s) / rise)
        const isTread = s % 4 === 0
        for (let k = -4; k <= 4; k++) this.put(x + k, from.y + s, 'stone', isTread ? 3.1 : s % 4 === 3 ? 0.6 : 1.7, i + 1, 14)
      }
    }
  }

  /** A point of a ledge: 0 = its left end, 1 = its right end, going round the back. */
  private onLedge(i: number, along: number): { x: number; y: number } {
    const ring = this.rings[i]!
    const angle = Math.PI * (1 - along)
    const x = Math.round(this.cx + ring.outer * (i === LAST ? 0.82 : 0.93) * Math.cos(angle))
    return { x, y: this.floorAt(i, x - this.cx) }
  }

  // ---- what moves -------------------------------------------------------------------------

  /** Where on the ledge they sit down when it fails. */
  private seat(): number {
    // The inner end, so that both are off the stair.
    const [from, to] = this.waiting(this.ring)
    return this.ring % 2 === 0 ? to : from
  }

  /** Dante sits next to the robot, not over it, whichever way they came. */
  private beside(lead: Step, follow: Step): Step {
    if (this.ring < 0 || this.ring === LAST || this.climb > 0) return follow
    const out = this.ring % 2 === 0 ? -0.01 : 0.01
    let along = this.along
    while (along > 0.02 && along < 0.98 && Math.abs(this.onLedge(this.ring, along).x - lead.x) < 15) along += out
    return { ...this.onLedge(this.ring, along), right: out < 0 }
  }

  private isSeated(goal: Goal): boolean {
    if (goal.mood !== 'failed' || this.ring !== this.fault || this.climb > 0 || this.ring === LAST) return true
    return Math.abs(this.along - this.seat()) < 0.012
  }

  /** How far down they are to go. What fails above them does not send them back up. */
  private wanted(goal: Goal): number {
    const depth = Math.max(-1, Math.min(LAST, goal.depth))
    return goal.mood === 'failed' ? Math.max(depth, this.ring + this.climb) : depth
  }

  /** Virgil walks to where the goal is, taking the stairs; Dante follows his steps. */
  private walk(goal: Goal, dt: number): void {
    const here = this.ring + this.climb
    const wanted = this.wanted(goal)
    if (wanted < here - 0.02 && (wanted < this.ring || this.climb === 0)) {
      // A new request: back before the gate.
      this.ring = -1
      this.climb = 0
      this.along = 0.2
      this.trail = []
    }
    if (this.ring < 0) {
      // Over the Acheron in Charon's boat, and down the first stair.
      if (wanted > -0.999) {
        this.climb = Math.min(1, this.climb + (this.climb < CROSSED ? 0.075 : 0.1) * (1 + Math.min(0.8, Math.max(0, wanted) * 0.14)) * dt)
        if (this.climb >= CROSSED || this.climb < BOARDED) this.walked += 18 * dt
        if (this.climb >= 1) {
          this.ring = 0
          this.climb = 0
          this.along = 0.16
        }
      }
      this.remember()
      return
    }
    // The further behind, the faster.
    const haste = 1 + Math.min(1, Math.max(0, wanted - here - 1) * 0.2)
    const length = Math.PI * this.rings[this.ring]!.outer
    const pace = (15 * haste * dt) / length
    if (wanted > here + 0.001 && this.ring < LAST) {
      const stair = this.stairAlong(this.ring)
      if (this.climb === 0 && Math.abs(this.along - stair) > 0.012) {
        this.heading = stair > this.along ? 1 : -1
        this.along += this.heading * Math.min(Math.abs(stair - this.along), pace)
        this.walked += 15 * haste * dt
      } else {
        const most = Math.min(1, wanted - this.ring)
        this.climb = Math.min(most, this.climb + 0.36 * haste * dt)
        this.walked += 11 * haste * dt
        if (this.climb >= 1) {
          this.ring++
          this.climb = 0
          this.along = this.stairAlong(this.ring - 1)
        }
      }
    } else if (this.ring === LAST) {
      // At the bottom they stop before Lucifer.
      if (this.along < 0.33) {
        this.heading = 1
        this.along = Math.min(0.33, this.along + pace * 0.8)
        this.walked += 12 * dt
      }
    } else if (!this.isSeated(goal)) {
      // Off the stair, to sit down.
      const gap = this.seat() - this.along
      this.heading = gap > 0 ? 1 : -1
      this.along += this.heading * Math.min(Math.abs(gap), pace * 0.8)
      this.walked += 12 * dt
    } else if (goal.mood === 'running' && this.climb === 0) {
      // On the side they came in by, so as not to stand before what there is to see.
      const [from, to] = this.waiting(this.ring)
      if (this.along > to) this.heading = -1
      if (this.along < from) this.heading = 1
      this.along += this.heading * pace * 0.55
      this.walked += 8 * dt
    }
    this.remember()
  }

  private remember(): void {
    const step = this.virgil()
    const last = this.trail.at(-1)
    if (last === undefined || last.x !== step.x || last.y !== step.y) this.trail.push(step)
    if (this.trail.length > 90) this.trail.shift()
  }

  /** Where the boat floats: at the gate, or on its way over. */
  private boatX(): number {
    const from = Math.min(this.w - 32, this.cx + 44)
    if (this.ring >= 0) return from
    const over = smooth(Math.max(0, Math.min(1, (this.climb - BOARDED) / (CROSSED - BOARDED))))
    return Math.round(from + (this.landing().x + 8 - from) * over)
  }

  private virgil(): Step {
    if (this.ring < 0) {
      const afloat = Math.round(Math.sin(this.t * 1.7) * 0.8)
      if (this.climb < BOARDED) {
        // Out of the dark wood, through the gate, to the boat.
        const u = this.climb / BOARDED
        return { x: Math.round(this.cx - 30 + u * 62), y: this.bank + (u > 0.94 ? 2 : 0), right: true }
      }
      if (this.climb < CROSSED) return { x: this.boatX() - 8, y: this.top - 5 + afloat, right: false }
      const down = (this.climb - CROSSED) / (1 - CROSSED)
      const from = this.landing()
      const to = this.onLedge(0, 0.16)
      return { x: Math.round(from.x + (to.x - from.x) * down), y: Math.round(from.y + (to.y - from.y) * down), right: true }
    }
    if (this.climb > 0 && this.ring < LAST) {
      const side = this.stairAlong(this.ring)
      const from = this.onLedge(this.ring, side)
      const to = this.onLedge(this.ring + 1, side)
      return { x: Math.round(from.x + (to.x - from.x) * this.climb), y: Math.round(from.y + (to.y - from.y) * this.climb), right: side < 0.5 }
    }
    return { ...this.onLedge(this.ring, this.along), right: this.heading > 0 }
  }

  private dante(lead: Step): Step {
    if (this.ring < 0 && this.climb < BOARDED) return { ...lead, x: lead.x - 15 }
    if (this.ring < 0 && this.climb < CROSSED + 0.05) return { ...lead, x: lead.x + 14 }
    // Sixteen pixels of Virgil's own path behind him.
    let left = this.ring === LAST ? 13 : 16
    let at: Step = lead
    for (let n = this.trail.length - 1; n >= 0; n--) {
      const step = this.trail[n]!
      left -= Math.hypot(step.x - at.x, step.y - at.y)
      if (left <= 0) return { ...step, right: step.x === lead.x ? lead.right : step.x < lead.x }
      at = step
    }
    const x = lead.x - (lead.right ? 14 : -14)
    const dx = x - this.cx
    return { x, y: this.climb > 0 ? lead.y : this.floorAt(Math.max(0, this.ring), dx), right: lead.right }
  }

  /** How hot each circle burns: embers everywhere, a blaze where the work is. */
  private heatOf(i: number, goal: Goal): number {
    const near = this.ring < 0 && this.climb < CROSSED ? 0 : Math.max(0, 1 - Math.abs(i - (this.ring + this.climb)) / 1.9)
    // The fires go out: only the one that failed still smoulders.
    if (goal.mood === 'failed') return i === this.fault ? 0.12 : 0.03
    if (goal.mood === 'running') return 0.14 + near * 0.86
    return 0.1 + near * 0.3
  }

  private burn(dt: number, goal: Goal): void {
    const { w } = this
    this.fireClock += dt
    const isDue = this.fireClock >= FIRE_BEAT
    if (isDue) this.fireClock = Math.min(FIRE_BEAT, this.fireClock - FIRE_BEAT)
    for (let i = 0; i < CIRCLES; i++) {
      // Cocytus does not burn: a cold mist at most.
      const want = this.heatOf(i, goal) * (i === LAST ? 0.35 : 1)
      const warmth = (this.warmth[i]! += (want - this.warmth[i]!) * Math.min(1, dt * 2.2))
      if (!isDue) continue
      const heat = this.heat[i]!
      const ring = this.rings[i]!
      const left = Math.max(0, Math.ceil(this.cx - ring.outer + 2))
      const right = Math.min(w - 1, Math.floor(this.cx + ring.outer - 2))
      for (let x = left; x <= right; x++) {
        // Where the bed burns, and where a tongue leaps: both drift along the ledge.
        const bed = cloud(x / 7, i * 5 + this.t * 0.25, 30)
        const tongue = cloud(x / 3.2, i * 9 + this.t * 1.5, 31)
        const isOn = bed < 0.26 + warmth * 0.42
        heat[x] = isOn ? Math.round(HOTTEST * (0.24 + warmth * 0.4 + tongue * 0.42 * (0.4 + warmth * 0.6)) * (0.8 + this.random() * 0.2)) : Math.max(0, heat[x]! - 8)
      }
      // How fast a tongue cools on its way up sets how tall it gets.
      const cool = HOTTEST / (3.2 + warmth * 8.5)
      const wind = Math.sin(this.t * 0.9 + i * 1.7) * 0.12
      for (let row = FIRE_ROWS - 1; row > 0; row--) {
        for (let x = left; x <= right; x++) {
          const r = this.random() + wind
          const from = Math.max(left, Math.min(right, x + (r < 0.24 ? 1 : r > 0.76 ? -1 : 0)))
          heat[row * w + x] = Math.max(0, heat[(row - 1) * w + from]! - Math.floor(this.random() * cool * 1.15))
        }
      }
    }
  }

  private fly(dt: number, goal: Goal): void {
    const many = goal.mood === 'running' || goal.mood === 'failed' ? 10 : 3
    if (this.sparks.length < many && this.random() < 0.12) {
      const i = Math.min(LAST - 1, Math.max(1, this.ring + (this.random() < 0.6 ? 0 : Math.floor(this.random() * 4) - 1)))
      const ring = this.rings[i]!
      this.sparks.push({ x: this.cx + (this.random() - 0.5) * 2 * ring.outer * 0.9, y: ring.y - ring.bow * 0.6, vx: 0, vy: -(4 + this.random() * 7), life: 1 + this.random() * 1.6 })
    }
    for (let n = this.sparks.length - 1; n >= 0; n--) {
      const spark = this.sparks[n]!
      spark.vx += (this.random() - 0.5) * 30 * dt
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      spark.life -= dt
      if (spark.life <= 0 || spark.y < 2) this.sparks.splice(n, 1)
    }
  }

  /** Put them somewhere at once, without the walk. */
  place(depth: number): void {
    this.ring = depth < 0 ? -1 : Math.min(LAST, Math.floor(depth))
    this.climb = this.ring < 0 || this.ring === LAST ? 0 : depth - this.ring
    const stair = this.stairAlong(Math.max(0, this.ring))
    this.along = this.ring === LAST ? 0.33 : this.climb > 0 ? stair : this.seat()
    this.heading = this.ring % 2 === 0 ? 1 : -1
    this.trail = []
    if (this.climb > 0) {
      // The way they would have come.
      const way = stair > 0.5 ? -1 : 1
      for (let n = 12; n >= 0; n--) this.trail.push({ ...this.onLedge(this.ring, stair + way * n * 0.02), right: way < 0 })
    }
    this.stars = 0
  }

  /** Nothing left to walk or fade: only the fire moves. */
  isSettled(goal: Goal): boolean {
    if (this.alarm !== (goal.mood === 'failed' ? 1 : 0)) return false
    const there = Math.abs(this.ring + this.climb - this.wanted(goal)) < 0.02
    return there && this.isSeated(goal) && this.stars === (goal.isDone ? 1 : 0)
  }

  // ---- painting ---------------------------------------------------------------------------

  /** Move everything on by `dt` seconds and paint it. The same array is reused for each frame. */
  frame(goal: Goal, dt: number): Uint8Array {
    this.t += dt * CALM
    if (goal.mood === 'failed') this.fault = Math.max(0, Math.min(LAST, Math.floor(goal.depth)))
    this.alarm = Math.max(0, Math.min(1, this.alarm + (goal.mood === 'failed' ? dt / 0.9 : -dt / 0.7)))
    const isThere = this.ring === LAST
    this.stars = Math.max(0, Math.min(1, this.stars + (goal.isDone && isThere ? dt / 3.2 : goal.isDone ? 0 : -dt / 0.9)))
    if (this.stars < 1) {
      this.walk(goal, dt)
      this.burn(dt, goal)
      this.fly(dt, goal)
    }
    if (this.stars >= 1) return this.paintStars()
    this.paintPit(goal)
    if (this.stars > 0) {
      const sky = this.paintStars()
      const { w, h, px } = this
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = y * w + x
          const gone = this.stars * 1.5 - (y / h) * 0.5
          if ((bayer(x, y) + 0.5) / 16 < gone) px[k] = sky[k]!
        }
      }
    }
    return this.px
  }

  private paintPit(goal: Goal): void {
    const { w, h, px, ramp, level, lit, far } = this
    // In an alarm the dark closes in, and a red lamp turns in the circle that failed.
    const lamp = 0.5 + 0.5 * Math.sin(this.t * 7)
    const dark = Math.round(this.alarm * 15)
    const isRed = this.alarm > 0.35
    // Light of each circle's fire by distance, flickering, in 16ths of a level.
    const light = new Int16Array(CIRCLES * DISTANCES)
    for (let i = 0; i < CIRCLES; i++) {
      const flicker = 0.88 + cloud(this.t * 5, i * 4, 50) * 0.24
      const glow = this.warmth[i]! * flicker + (i === this.fault ? this.alarm * (0.28 + lamp * 0.4) : 0)
      for (let d = 0; d < DISTANCES; d++) light[i * DISTANCES + d] = Math.round(glow * 62 * Math.exp(-d / 17) + (this.warmth[i]! - 0.1) * 8)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x
        const of = lit[k]!
        const isAlight = of === this.fault && far[k]! < (ramp[k] === RAMP.rock ? 17 + bayer(x, y) : 40)
        const value = level[k]! + (of < 0 ? 0 : light[of * DISTANCES + far[k]!]!) + bayer(x, y) - 8 - (isAlight ? 0 : dark)
        const step = value < 0 ? 0 : value >> 4
        px[k] = (isRed && isAlight ? RAMP.blood : ramp[k]!) + (step >= LEVELS ? LEVELS - 1 : step)
      }
    }
    const lead = this.virgil()
    const follow = this.dante(lead)
    if (this.alarm < 0.5) this.paintLantern(lead)
    this.paintGate()
    this.paintAcheron()
    const canvas: Canvas = { w, h, px }
    this.paintFire()
    for (let i = 0; i < CIRCLES; i++) {
      if (i === this.fault && this.alarm > 0.35) this.paintBroken(i, canvas)
      else this.paintCircle(i, canvas)
    }
    this.paintRims(goal)
    this.paintNames(canvas)
    this.paintPlaques(goal, canvas)
    const isMoving = this.climb > 0 || goal.mood === 'running' || goal.depth > this.ring + this.climb + 0.01
    const pose = isMoving ? Math.floor(this.walked / 5) % 4 : 0
    // Stopped by a fault, and there: Dante sits down, and the robot is out of order.
    const isDown = this.alarm > 0.6 && this.ring + this.climb >= this.fault && this.isSeated(goal)
    const figures: Array<[readonly string[], Step]> = isDown ? [[VIRGIL_DOWN, lead], [DANTE_DOWN, this.beside(lead, follow)]] : [[VIRGIL[pose]!, lead], [DANTE[(pose + 2) % 4]!, follow]]
    figures.sort((a, b) => a[1].y - b[1].y)
    for (const [art, at] of figures) stamp(canvas, art, at.x, at.y, at.right)
    this.paintBoat(canvas)
    if (isDown && noise(1, Math.floor(this.t * 12), 97) < 0.4) for (let n = 0; n < 4; n++) this.dot(lead.x + 2 + (noise(n, 2, Math.floor(this.t * 12)) - 0.5) * 10, lead.y - 22 + noise(n, 3, Math.floor(this.t * 12)) * 8, n % 2 === 0 ? SPOT.amber : SPOT.star)
    for (const spark of this.sparks) {
      const x = Math.round(spark.x)
      const y = Math.round(spark.y)
      if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = FLAME[0]![spark.life > 1.2 ? 7 : spark.life > 0.6 ? 5 : 3]!
    }
  }

  /** The name in neon, its five initials brighter. */
  private paintGate(): void {
    const { w, h, px, ramp } = this
    const canvas: Canvas = { w, h, px }
    const cx = Math.round(this.cx)
    const { arch, sign, half, foot } = this.gate()
    if (this.alarm > 0.35) {
      // The lamps are out, and a wider board says so, and why.
      const wide = Math.min(57, (w >> 1) - 3)
      const top = arch - 33
      for (let y = top; y < top + 31; y++) for (let x = cx - wide; x <= cx + wide; x++) this.dot(x, y, RAMP.stone + (Math.abs(x - cx) === wide || y === top || y === top + 30 ? 2 : 0))
      const isOn = Math.sin(this.t * 7) > -0.55
      const word = 'ERROR'
      ;[...word].forEach((letter, k) => writeBig(canvas, letter, cx - 14 + k * 6, top + 4, isOn ? SPOT.red : RAMP.blood + 4))
      wrap(capitals(this.labels.reason ?? ''), wide * 2 - 6, 2).forEach((line, n) => write(canvas, line, cx - (textWidth(line) >> 1), top + 15 + n * 7, SPOT.amber))
      return
    }
    // Two lamps over the board; now and then one of them fails for a moment.
    const isDim = [0, 1].map(n => noise(n, Math.floor(this.t * 9), 101) < 0.05)
    // Their light on the wood, the stones and the ground.
    this.halo ??= this.haloOf()
    for (const { k, by } of this.halo) {
      const step = px[k]! - ramp[k]!
      if (step >= 0 && step < LEVELS - 1) px[k] = px[k]! + (by === 2 && step < LEVELS - 2 && step > 0 ? 2 : 1)
    }
    const key = (isDim[0]! ? 1 : 0) + (isDim[1]! ? 2 : 0)
    const board = this.boards[key] ?? (this.boards[key] = this.boardOf(isDim))
    const wide = half * 2 + 1
    for (let y = sign; y < foot; y++) for (let x = 0; x < wide; x++) this.dot(cx - half + x, y, board[(y - sign) * wide + x]!)
    isDim.forEach((dim, n) => {
      const x = cx + (n === 0 ? -1 : 1) * Math.round(half * 0.5)
      for (let k = 0; k < 4; k++) this.dot(x, sign - 1 - k, SPOT.metalDark)
      for (let k = -3; k <= 3; k++) this.dot(x + k, sign - 4, SPOT.metalDark)
      for (let k = -2; k <= 2; k++) this.dot(x + k, sign - 5, SPOT.metal)
      for (let k = -2; k <= 2; k++) this.dot(x + k, sign - 3, dim ? SPOT.amberDark : SPOT.window)
    })
    if (half * 2 - 5 < SMALL_SIZE.w) return
    // Now and then a light runs over the letters.
    const shine = ((this.t * 1.1) % 11) * 22 - 20
    if (shine > SIGN.w + SIGN.h + 4) return
    for (let y = 0; y < SIGN.h; y++) {
      for (let x = Math.max(0, Math.floor(shine - SIGN.h - 3)); x < Math.min(SIGN.w, shine + 4); x++) {
        if (SIGN.px[y * SIGN.w + x]! > 0 && Math.abs(x + (SIGN.h - y) * 0.8 - shine) < 2.5) this.dot(cx - (SIGN.w >> 1) + x, sign + 2 + y, SPOT.star)
      }
    }
  }

  /** Where the lamps of the sign reach, and by how much they lighten it. */
  private haloOf(): Array<{ k: number; by: number }> {
    const { ground, sign, half, foot } = this.gate()
    const cx = Math.round(this.cx)
    const halo: Array<{ k: number; by: number }> = []
    for (let y = Math.max(0, sign - 8); y <= ground + 1; y++) {
      for (let x = Math.max(0, cx - half - 26); x <= Math.min(this.w - 1, cx + half + 26); x++) {
        const d = Math.hypot(Math.max(0, Math.abs(x - cx) - half), Math.max(0, sign - y, (y - foot) * 0.75))
        const glow = 1.35 - d / 19 - (bayer(x, y) + 0.5) / 16
        if (d > 0 && glow > 0) halo.push({ k: y * this.w + x, by: glow > 0.8 ? 2 : 1 })
      }
    }
    return halo
  }

  /** The board with the name, under its two lamps. */
  private boardOf(isDim: readonly boolean[]): Uint8Array {
    const { sign, half, foot } = this.gate()
    const cx = Math.round(this.cx)
    const wide = half * 2 + 1
    const tall = foot - sign
    const px = new Uint8Array(wide * tall)
    const set = (x: number, y: number, color: number): void => {
      if (x >= 0 && y >= 0 && x < wide && y < tall) px[y * wide + x] = color
    }
    const shadeAt = (x: number, y: number): number =>
      Math.min(...isDim.map((dim, n) => Math.hypot((x - half - (n === 0 ? -1 : 1) * Math.round(half * 0.5)) / (half * 0.72), (y - 2) / 24) + (dim ? 0.3 : 0))) + (bayer(cx - half + x, sign + y) / 16 - 0.5) * 0.14
    for (let y = 0; y < tall; y++) {
      for (let x = 0; x < wide; x++) {
        const isFrame = x === 0 || x === wide - 1 || y === 0 || y === tall - 1
        const v = shadeAt(x, y)
        set(x, y, isFrame ? (y === 0 && v < 0.6 ? RAMP.earth + 5 : RAMP.earth + 2) : v < 0.3 ? SPOT.coif : v < 0.58 ? SPOT.bone : v < 0.86 ? SPOT.togaShade : RAMP.earth + 6)
      }
    }
    if (half * 2 - 5 < SMALL_SIZE.w) {
      // Too narrow for it: the five letters alone.
      const times = half * 2 > 64 ? 2 : 1
      const tiny: Canvas = { w: 29, h: 7, px: new Uint8Array(29 * 7) }
      LETTERS.forEach((letter, k) => writeBig(tiny, letter, k * 6, 0, SPOT.robeDark))
      for (let y = 0; y < 7 * times; y++) for (let x = 0; x < 29 * times; x++) if (tiny.px[Math.floor(y / times) * 29 + Math.floor(x / times)] !== 0) set(half - ((29 * times) >> 1) + x, 11 - ((7 * times) >> 1) + y, SPOT.robeDark)
      return px
    }
    const left = half - (SIGN.w >> 1)
    const inked = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SIGN.w && y < SIGN.h && SIGN.px[y * SIGN.w + x]! > 0
    for (let y = 0; y <= SIGN.h; y++) {
      for (let x = 0; x <= SIGN.w; x++) {
        const v = shadeAt(left + x, 2 + y)
        if (inked(x, y)) {
          const tone = SIGN.px[y * SIGN.w + x]!
          set(left + x, 2 + y, SIGN_INK[tone < 6 && v > 0.8 ? tone + 1 : tone]!)
        } else if (inked(x - 1, y - 1)) set(left + x, 2 + y, v < 0.7 ? RAMP.stone + 6 : RAMP.earth + 4)
      }
    }
    return px
  }

  /** The little light the two carry. */
  private paintLantern(at: Step): void {
    const { w, h, px, ramp } = this
    const cy = at.y - 12
    for (let y = Math.max(0, cy - 22); y <= Math.min(h - 1, cy + 18); y++) {
      for (let x = Math.max(0, at.x - 24); x <= Math.min(w - 1, at.x + 24); x++) {
        const d = Math.hypot(x - at.x, (y - cy) * 1.15)
        if (d > 24 || d / 24 > 0.35 + (bayer(x, y) / 16) * 0.65) continue
        const k = y * w + x
        const step = px[k]! - ramp[k]!
        if (step >= 0 && step < LEVELS - 1) px[k] = px[k]! + 1
      }
    }
  }

  /** The river is the torrent: now and then a packet comes down it. */
  private paintAcheron(): void {
    const { t } = this
    for (let y = this.bank + 1; y < this.top; y++) {
      for (let x = 0; x < this.w; x++) {
        const wave = Math.sin(x * 0.22 + t * 0.9 + y * 2.4) + Math.sin(x * 0.09 - t * 0.6 + y * 1.3)
        if (wave > 1.6) this.dot(x, y, RAMP.sea + 4)
        else if (wave > 1.15) this.dot(x, y, RAMP.sea + 3)
      }
    }
    // What is lit on the bank, broken up by the water.
    if (this.alarm < 0.35) {
      const { half } = this.gate()
      const cx = Math.round(this.cx)
      for (let y = this.bank + 1; y < this.top; y++) {
        const deep = (y - this.bank) / (this.top - this.bank)
        const sway = Math.round(Math.sin(y * 1.9 + t * 2.1) * 1.6)
        for (let x = cx - half; x <= cx + half; x++) {
          const isDoor = Math.abs(x - cx) < 13
          const chance = (isDoor ? 0.5 : 0.2) * (1 - deep * 0.55) * (1 - (Math.abs(x - cx) / half) * 0.4)
          if (noise((x + sway) >> 2, y, Math.floor(t * 3 + y * 0.7)) < chance) this.dot(x, y, isDoor ? RAMP.fire + (deep < 0.5 ? 5 : 4) : RAMP.gold + (deep < 0.5 ? 3 : 2))
        }
      }
    }
    for (let n = 0; n < 3; n++) {
      const x = Math.round((noise(n, 1, 63) * this.w + t * 6) % (this.w + 6))
      const y = this.bank + 3 + n * 2
      for (let b = 0; b < 2; b++) for (let a = 0; a < 3; a++) this.dot(this.w - x + a, y + b, b === 0 ? SPOT.screen : SPOT.blueDark)
    }
  }

  /** Charon's boat, a lantern at its prow, over the feet of those it carries. */
  private paintBoat(canvas: Canvas): void {
    const x = this.boatX()
    const y = this.top - 4 + Math.round(Math.sin(this.t * 2.6) * 0.8)
    const isRowing = this.ring < 0 && this.climb > BOARDED && this.climb < CROSSED
    for (let k = 0; k < 11; k++) this.dot(x - 22, y - 4 - k, SPOT.hullLight)
    for (let a = -1; a <= 1; a++) for (let b = 0; b < 4; b++) this.dot(x - 25 + a, y - 13 + b, b === 0 ? SPOT.hullLight : a === 0 ? SPOT.window : SPOT.amber)
    this.dot(x - 24, y - 15, SPOT.hullLight)
    this.dot(x - 23, y - 15, SPOT.hullLight)
    this.dot(x - 25, y - 14, SPOT.hullLight)
    stamp(canvas, FERRYMAN, x + 19, y - 1, false)
    const pull = isRowing ? Math.sin(this.t * 4.4) : 0.3
    for (let k = 0; k < 17; k++) this.dot(x + 14 + k * (0.45 + pull * 0.3), y - 9 + k * 0.85, SPOT.hullLight)
    for (let a = -24; a <= 27; a++) {
      const bow = Math.max(0, Math.abs(a - 1.5) - 18)
      const top = y - Math.round(bow * 0.75)
      const depth = 5 - Math.round(Math.max(0, Math.abs(a - 1.5) - 15) * 0.32)
      for (let b = 0; b < depth; b++) this.dot(x + a, top + b, b === 0 ? SPOT.hullLight : (a + 40) % 8 === 0 || b === 2 ? SPOT.hull : RAMP.wood + 4)
    }
    if (isRowing) for (let k = 0; k < 9; k++) this.dot(x + 29 + k * 2 + ((this.t * 14) % 2), y + 3 + (k % 2), RAMP.sea + 6)
  }

  /** The name of each circle, cut in its wall. */
  private paintNames(canvas: Canvas): void {
    this.labels.circles.forEach((name, i) => {
      const ring = this.rings[i]
      if (ring === undefined) return
      const text = capitals(name)
      const roof = i === 0 ? this.top + 4 : this.rings[i - 1]!.y - Math.round(this.rings[i - 1]!.bow * 0.35)
      const isHere = i === this.ring
      const x = Math.round(this.cx) - (textWidth(text) >> 1)
      const y = roof + (i === LAST || i === 0 ? 0 : 5)
      write(canvas, text, x + 1, y + 1, SPOT.void)
      write(canvas, text, x, y, i < this.ring ? RAMP.gold + 3 : isHere ? RAMP.gold + 5 : RAMP.stone + 4)
    })
  }

  /** D A N T E, one letter for each step, down the left of the pit; what the step found, on the right. */
  private paintPlaques(goal: Goal, canvas: Canvas): void {
    const { facts, lit, now } = this.labels
    const beat = 0.5 + 0.5 * Math.sin(this.t * 4)
    LETTERS.forEach((letter, n) => {
      const i = n * 2
      const ring = this.rings[i]!
      const x = Math.max(1, Math.round(this.cx - ring.outer - 15))
      const y = ring.y - 17
      const isDone = lit[n] === true
      const isNow = n === now
      const isBroken = goal.mood === 'failed' && isNow
      for (let b = 0; b < 13; b++) {
        for (let a = 0; a < 11; a++) {
          const isEdge = b === 0 || a === 0 || b === 12 || a === 10
          const base = isDone || isNow ? RAMP.gold : RAMP.stone
          this.dot(x + a, y + b, base + (isEdge ? (b === 0 || a === 0 ? 4 : 2) : 1))
        }
      }
      const color = isBroken ? SPOT.eye : isDone ? RAMP.gold + 6 : isNow ? FLAME[0]![4 + Math.round(beat * 3)]! : RAMP.stone + 5
      writeBig(canvas, letter, x + 3, y + 3, color)
      const fact = capitals(facts[n] ?? '')
      if (fact === '') return
      const at = Math.min(this.w - textWidth(fact) - 2, Math.round(this.cx + ring.outer + 5))
      write(canvas, fact, at + 1, ring.y + 2, SPOT.void)
      write(canvas, fact, at, ring.y + 1, isDone ? RAMP.gold + 5 : FLAME[0]![6]!)
    })
  }

  private dot(x: number, y: number, color: number): void {
    const X = Math.round(x)
    const Y = Math.round(y)
    if (X >= 0 && X < this.w && Y >= 0 && Y < this.h) this.px[Y * this.w + X] = color
  }

  /** Inside a circle's room: on its far wall or ledge. */
  private isInRoom(i: number, x: number, y: number): boolean {
    const ring = this.rings[i]!
    const roof = i === 0 ? this.top : this.rings[i - 1]!.y + 4
    return y > roof && y < ring.y && Math.abs(x - this.cx) < ring.outer - 2
  }

  /**
   * One thing in each circle, big enough to know it by. It sleeps until they come, works while
   * they are there, and stays done behind them.
   */
  private paintCircle(i: number, canvas: Canvas): void {
    const { t, labels } = this
    const ring = this.rings[i]!
    const cx = Math.round(this.cx)
    const floor = (dx: number): number => this.floorAt(i, dx)
    const foot = floor(0)
    const isHere = i === this.ring
    const isPast = i < this.ring
    const isAsleep = !isHere && !isPast
    const asleep = (color: number): number => (color === SPOT.outline ? color : RAMP.stone + 3)
    switch (i) {
      case 0: {
        // Catalogue: a strip of film, and the lens that finds the one.
        const left = cx - 37
        const top = foot - 14
        for (let y = 0; y < 13; y++) {
          for (let x = 0; x < 75; x++) {
            const isHole = (y === 1 || y === 11) && x % 5 > 1 && x % 5 < 4
            const n = Math.floor(x / 15)
            const isFrame = y > 2 && y < 10 && x % 15 > 1 && x % 15 < 14
            const isGround = y > 6 + ((x + n * 3) % 5 === 0 ? 1 : 0)
            const picture = isAsleep ? RAMP.night + (isGround ? 1 : 2) : isGround ? RAMP.sea + 2 + (n % 2) : RAMP.dawn + 2 + (n % 3)
            const isFound = isPast && n === 2
            const isRim = isFound && y > 1 && y < 11 && (y === 2 || y === 10 || x % 15 === 1 || x % 15 === 14) && x % 15 > 0
            this.dot(left + x, top + y, isRim ? SPOT.laurelGold : isHole ? (isAsleep ? SPOT.togaDark : SPOT.togaShade) : isFrame ? picture : SPOT.outline)
          }
        }
        const x = cx + Math.round(isAsleep ? -33 : isPast ? 0 : Math.sin(t * 0.7) * 27)
        const y = top + 6
        for (let b = -6; b <= 6; b++) {
          for (let a = -6; a <= 6; a++) {
            const r = Math.hypot(a, b)
            if (r < 4.6 && a + b < -4 && !isAsleep) this.dot(x + a, y + b, SPOT.screen)
            else if (r >= 4.6 && r < 6.5) this.dot(x + a, y + b, isPast ? (r < 5.6 ? SPOT.laurelGold : RAMP.gold + 3) : r < 5.6 && !isAsleep ? SPOT.metalLight : SPOT.metalDark)
          }
        }
        for (let k = 0; k < 7; k++) for (let a = 0; a < 3; a++) this.dot(x + 5 + k + a, y + 5 + k, a === 1 ? SPOT.hullLight : SPOT.hull)
        break
      }
      case 1: {
        // Indexers: a magnet. It draws the torrents in, and keeps them.
        if (isHere) {
          for (let n = 0; n < 3; n++) {
            const life = (t * 0.16 + n / 3) % 1
            const side = n % 2 === 0 ? -1 : 1
            const dx = side * (ring.outer * 0.72 * (1 - life) + 4 * life)
            if (life < 0.9) stamp(canvas, FILE, cx + Math.round(dx), foot - 4 - Math.round(Math.sin(life * Math.PI) * 5))
          }
        }
        const top = foot - 18
        for (let y = 0; y < 18; y++) {
          for (let a = -10; a <= 10; a++) {
            const d = y < 8 ? Math.abs(a) : Math.hypot(a, y - 8)
            if (d < 4 || d > 10) continue
            const isEdge = d < 4.9 || d > 9.1 || (y === 0 && d >= 4)
            const tip = isAsleep ? SPOT.metalDark : a < 0 ? SPOT.coif : SPOT.togaShade
            const body = isAsleep ? RAMP.blood + (a > 5 ? 2 : 3) : d > 8 && a < 0 ? SPOT.robeLight : a > 5 ? SPOT.robeDark : SPOT.robe
            this.dot(cx + a, top + y, isEdge ? SPOT.outline : y < 5 ? tip : body)
          }
        }
        if (isPast) for (const dx of [-15, 15]) stamp(canvas, FILE, cx + dx, foot - 4)
        break
      }
      case 2: {
        // Trackers: a radar, under a thin rain of bits.
        if (isHere) {
          for (let n = 0; n < 9; n++) {
            const life = (t * (0.2 + noise(n, 1, 72) * 0.1) + noise(n, 2, 72)) % 1
            const u = (n / 8) * 2 - 1
            if (Math.abs(u) < 0.3) continue
            const x = Math.round(cx + u * ring.outer * 0.86)
            const y = Math.round(ring.y - ring.tall + 3 + life * (ring.tall - ring.bow - 8))
            if (this.isInRoom(i, x - 2, y) && this.isInRoom(i, x + 4, y + 5)) write(canvas, noise(n, Math.floor(life * 4), 73) < 0.5 ? '0' : '1', x, y, life < 0.15 || life > 0.85 ? SPOT.greenDark : SPOT.green)
          }
        }
        const y0 = foot - 9
        const sweep = t * 1.6
        const since = (a: number, b: number): number => (((sweep - Math.atan2(b, a)) % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2)
        for (let b = -9; b <= 9; b++) {
          for (let a = -9; a <= 9; a++) {
            const r = Math.hypot(a, b)
            if (r > 9.4) continue
            const behind = isHere ? since(a, b) : 9
            const isLine = Math.abs(r - 5) < 0.5 || a === 0 || b === 0
            const color = r > 8.2 ? (isAsleep ? SPOT.metalDark : SPOT.metal) : behind < 0.22 ? SPOT.led : behind < 0.8 && bayer(a + 32, b + 32) > behind * 18 ? SPOT.green : isLine ? (isAsleep ? RAMP.bog + 1 : SPOT.greenDark) : SPOT.outline
            this.dot(cx + a, y0 + b, color)
          }
        }
        if (!isAsleep) {
          for (const [a, b] of [[4, -4], [-5, 2], [2, 5]] as const) {
            const behind = isPast ? 0 : since(a, b)
            if (behind < 3.4) for (const [p, q] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) this.dot(cx + a + p, y0 + b + q, behind < 1.6 ? SPOT.led : SPOT.green)
          }
        }
        for (let a = -5; a <= 5; a++) this.dot(cx + a, foot, SPOT.metalDark)
        break
      }
      case 3: {
        // Seeders: one gives, one takes, and the file between them. It ends up given.
        const pull = isHere ? Math.round(Math.sin(t * 1.1) * 7) : isPast ? 10 : 0
        const bob = isHere ? Math.round(Math.sin(t * 2.2)) : 0
        stamp(canvas, UP, cx - 27, floor(27) - 1 + bob, true, isAsleep ? asleep : undefined)
        stamp(canvas, CRATE, cx + pull, floor(pull) - 1, true, isAsleep ? asleep : undefined)
        stamp(canvas, DOWN, cx + 27, floor(27) - 1 - bob, true, isAsleep ? asleep : undefined)
        break
      }
      case 4: {
        // Cache: a cloud with a bolt, the sign of what is there at once. Lit when something is.
        const isLit = (labels.cached ?? 0) > 0 && !isAsleep
        const isSeeking = isHere && labels.checked === undefined && Math.sin(t * 4) > 0
        const top = foot - 20
        for (let y = 0; y < 16; y++) {
          for (let a = -17; a <= 17; a++) {
            const isIn = Math.hypot(a + 8, y - 10) < 6.4 || Math.hypot(a - 1, y - 7) < 7.6 || Math.hypot(a - 10, y - 10.5) < 5.6 || (y > 9 && y < 16 && Math.abs(a) < 13)
            if (!isIn) continue
            this.dot(cx + a, top + y, isLit ? (y < 4 ? SPOT.star : y > 12 ? SPOT.togaShade : SPOT.coif) : isAsleep ? RAMP.stone + (y < 4 ? 4 : y > 12 ? 2 : 3) : y < 4 ? SPOT.metalLight : y > 12 ? SPOT.metalDark : SPOT.metal)
          }
        }
        const bolt = ['...yyyy', '..yyyy.', '.yyyy..', 'yyyyyy.', '..yyy..', '.yyy...', '.yy....', 'yy.....', 'y......']
        bolt.forEach((row, b) => {
          ;[...row].forEach((letter, a) => {
            if (letter === '.') return
            this.dot(cx - 3 + a, top + 5 + b, isLit || isSeeking ? SPOT.amber : isAsleep ? RAMP.stone + 1 : SPOT.metalDark)
            if (row[a + 1] === '.' || row[a + 1] === undefined) this.dot(cx - 2 + a, top + 5 + b, isLit || isSeeking ? SPOT.amberDark : SPOT.outline)
          })
        })
        break
      }
      case 5: {
        // Firewall: a padlock on the wall of brick. Shut, then tried, then open.
        const body = isPast ? [SPOT.green, SPOT.greenDark, SPOT.led] : isHere ? [SPOT.amber, SPOT.amberDark, SPOT.laurelGold] : [RAMP.stone + 3, RAMP.stone + 1, RAMP.stone + 5]
        const top = foot - 19
        const lift = isPast ? -2 : isHere ? Math.round(Math.max(0, Math.sin(t * 3)) * -1) : 0
        for (let y = 0; y < 9; y++) {
          for (let a = -6; a <= 6; a++) {
            const r = y < 6 ? Math.hypot(a, y - 6) : Math.abs(a)
            if (r < 3.4 || r > 6.2) continue
            // Open: its right leg is out of the lock.
            if (isPast && a > 0 && y > 5) continue
            this.dot(cx + a, top + y + lift, r > 5.4 || r < 4 ? SPOT.metalDark : SPOT.metalLight)
          }
        }
        for (let y = 0; y < 11; y++) {
          for (let a = -8; a <= 8; a++) {
            const isEdge = y === 0 || y === 10 || Math.abs(a) === 8
            const isHole = (Math.hypot(a, y - 4) < 1.9 || (Math.abs(a) < 1 && y >= 4 && y < 8)) && !isEdge
            this.dot(cx + a, top + 8 + y, isHole ? SPOT.outline : isEdge ? body[1]! : y === 1 ? body[2]! : body[0]!)
          }
        }
        break
      }
      case 6: {
        // Debrid: the river is the download, and fills with it.
        const percent = labels.percent ?? 0
        const left = Math.ceil(this.cx - ring.outer + 2)
        const right = Math.floor(this.cx + ring.outer - 2)
        const flow = isHere ? t : 0
        for (let x = left; x <= right; x++) {
          const back = Math.round(this.back(i, x - this.cx))
          const depth = Math.max(2, floor(x - this.cx) - back + 3)
          const isFull = ((x - left) / (right - left)) * 100 < percent
          for (let y = back; y < back + depth; y++) {
            const wave = Math.sin(x * 0.4 + flow * 2.4 + y) + Math.sin(x * 0.17 - flow * 1.7)
            this.dot(x, y, isFull ? (wave > 1.1 ? SPOT.led : wave > -0.3 ? SPOT.green : SPOT.greenDark) : wave > 1.1 && !isAsleep ? SPOT.blood : RAMP.blood + (wave > -0.3 ? 3 : 2))
          }
        }
        const isDone = percent >= 100
        const tone = isDone ? [SPOT.greenDark, SPOT.led, SPOT.green] : isAsleep ? [RAMP.stone + 1, RAMP.stone + 4, RAMP.stone + 3] : [SPOT.amberDark, SPOT.laurelGold, SPOT.amber]
        const y = Math.round(foot - 10 + (isHere && !isDone ? Math.sin(t * 2) * 1.6 : 0))
        for (let b = 0; b < 15; b++) {
          const half = b < 7 ? 3 : 14 - b
          for (let a = -half; a <= half; a++) this.dot(cx + a, y - 10 + b, Math.abs(a) === half || b === 0 ? tone[0]! : a < 0 ? tone[1]! : tone[2]!)
        }
        break
      }
      case 7: {
        // Links: two, apart until they come, then one through the other. Gold once there is one to play.
        const isOpen = labels.lit[3] === true && !isAsleep
        const [light, mid, dark] = isOpen ? [RAMP.gold + 6, RAMP.gold + 4, RAMP.gold + 2] : isAsleep ? [RAMP.stone + 4, RAMP.stone + 3, RAMP.stone + 1] : [SPOT.metalLight, SPOT.metal, SPOT.metalDark]
        const y0 = foot - 8
        const apart = isAsleep ? 12 : isHere && !isOpen ? 8 + Math.round((0.5 + 0.5 * Math.sin(t * 1.4)) * 4) : 7
        const link = (x0: number, only?: (a: number, b: number) => boolean): void => {
          for (let b = -6; b <= 6; b++) {
            for (let a = -10; a <= 10; a++) {
              const r = Math.hypot(Math.max(0, Math.abs(a) - 4), b)
              if (r > 6.2 || r < 3 || (only !== undefined && !only(a, b))) continue
              this.dot(x0 + a, y0 + b, r > 5.4 ? (b < 0 ? light : dark) : r < 3.8 ? dark : mid)
            }
          }
        }
        link(cx - apart)
        link(cx + apart)
        if (apart < 10) link(cx - apart, (a, b) => b > 0 && a > 2)
        break
      }
      default:
        // Player: everything frozen, waiting for it to load.
        this.paintPlayer(cx + 9, foot)
        for (let n = 0; n < 7 && isHere; n++) {
          const life = (t * (0.09 + noise(n, 1, 78) * 0.05) + noise(n, 2, 78)) % 1
          const x = this.cx + (noise(n, 3, 78) * 2 - 1) * ring.outer * 0.9 + Math.sin(life * 5 + n) * 2
          const y = ring.y - ring.tall + life * ring.tall
          if (this.isInRoom(i, x, y)) this.dot(x, y, SPOT.snow)
        }
    }
  }

  /** The same things, broken, each in its own way; smoke, and a warning. */
  private paintBroken(i: number, canvas: Canvas): void {
    const { t } = this
    const ring = this.rings[i]!
    const cx = Math.round(this.cx)
    const foot = this.floorAt(i, 0)
    const tick = Math.floor(t * 14)
    const shake = Math.round(Math.sin(t * 30) * Math.max(0, Math.sin(t * 3)))
    const box = (x: number, y: number, w: number, h: number, color: number): void => {
      for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) this.dot(x + a, y + b, color)
    }
    switch (i) {
      case 0: {
        // The film, torn; the lens, on the floor.
        for (const side of [-1, 1]) {
          for (let y = 0; y < 13; y++) {
            for (let x = 4; x < 36; x++) {
              const rip = 4 + ((y * 5) % 4)
              if (x < rip) continue
              const drop = Math.round(Math.max(0, 14 - x) * 0.35)
              const isHole = (y === 1 || y === 11) && x % 5 > 1 && x % 5 < 4
              const isFrame = y > 2 && y < 10 && x % 15 > 1 && x % 15 < 14
              this.dot(cx + side * x, foot - 15 + y + drop, isHole ? SPOT.togaDark : isFrame ? RAMP.blood + (y > 6 ? 1 : 2) : SPOT.outline)
            }
          }
        }
        for (let a = 0; a < 40; a++) this.dot(cx - 1 + Math.cos((a / 40) * 6.3) * 5, foot - 3 + Math.sin((a / 40) * 6.3) * 2.4, SPOT.metal)
        for (let a = 0; a < 4; a++) this.dot(cx - 3 + a, foot - 4 + (a % 2), SPOT.screen)
        break
      }
      case 1: {
        // The magnet, in two; what it held, on the floor.
        for (const side of [-1, 1]) {
          for (let y = 0; y < 18; y++) {
            for (let a = 1; a <= 10; a++) {
              const d = y < 8 ? a : Math.hypot(a, y - 8)
              if (d < 4 || d > 10 || (y > 13 && a < 2 + (y % 3))) continue
              const isEdge = d < 4.9 || d > 9.1 || y === 0
              this.dot(cx + side * (a + 3) + (side < 0 ? Math.round(-y * 0.1) : 0), foot - 18 + y + (side > 0 ? 1 : 0), isEdge ? SPOT.outline : y < 5 ? SPOT.metal : RAMP.blood + (a > 6 ? 2 : 4))
            }
          }
        }
        for (const dx of [-26, 22, 31]) stamp(canvas, FILE, cx + dx, this.floorAt(i, dx) - 1, true, color => (color === SPOT.outline ? color : RAMP.stone + 4))
        break
      }
      case 2: {
        // The radar, seeing nothing but noise.
        for (let b = -9; b <= 9; b++) {
          for (let a = -9; a <= 9; a++) {
            const r = Math.hypot(a, b)
            if (r > 9.4) continue
            const n = noise(a, b, tick)
            this.dot(cx + a, foot - 9 + b, r > 8.2 ? SPOT.metalDark : Math.abs(Math.abs(a) - Math.abs(b)) < 1 ? SPOT.red : n < 0.3 ? RAMP.blood + 3 : n < 0.42 ? RAMP.blood + 4 : SPOT.outline)
          }
        }
        box(cx - 5, foot, 11, 1, SPOT.metalDark)
        break
      }
      case 3: {
        // The file, smashed between them.
        const grey = (color: number): number => (color === SPOT.outline ? color : RAMP.stone + 3)
        stamp(canvas, UP, cx - 27, this.floorAt(i, 27) - 1, true, grey)
        stamp(canvas, DOWN, cx + 27, this.floorAt(i, 27) - 1, true, grey)
        for (const [dx, dy, w, h] of [[-9, -3, 7, 3], [3, -4, 6, 4], [-2, -8, 5, 4], [-13, -1, 4, 1], [10, -1, 4, 1], [-4, -2, 3, 2]] as const) {
          box(cx + dx, foot - 1 + dy, w, h, SPOT.amberDark)
          box(cx + dx, foot - 1 + dy, w, 1, SPOT.amber)
        }
        break
      }
      case 4: {
        // The cloud, gone dark, and it rains.
        const top = foot - 22
        for (let y = 0; y < 15; y++) {
          for (let a = -17; a <= 17; a++) {
            const isIn = Math.hypot(a + 8, y - 9) < 6 || Math.hypot(a - 1, y - 7) < 7.2 || Math.hypot(a - 10, y - 9.5) < 5.4 || (y > 8 && y < 14 && Math.abs(a) < 13)
            if (isIn) this.dot(cx + a, top + y, y < 4 ? SPOT.metal : y > 11 ? SPOT.outline : SPOT.metalDark)
          }
        }
        for (const [a, b] of [[-3, -3], [-2, -2], [-1, -1], [0, 0], [1, 1], [2, 2], [3, 3], [3, -3], [2, -2], [1, -1], [-1, 1], [-2, 2], [-3, 3]] as const) box(cx + a, top + 8 + b, 2, 1, SPOT.red)
        for (let n = 0; n < 9; n++) {
          const life = (t * 1.1 + noise(n, 1, 98)) % 1
          for (let k = 0; k < 2; k++) this.dot(cx - 13 + n * 3.2, top + 16 + life * 8 + k, SPOT.rain)
        }
        break
      }
      case 5: {
        // The padlock, shut and red, however it is shaken.
        const x = cx + shake
        for (let y = 0; y < 9; y++) {
          for (let a = -6; a <= 6; a++) {
            const r = y < 6 ? Math.hypot(a, y - 6) : Math.abs(a)
            if (r >= 3.4 && r <= 6.2) this.dot(x + a, foot - 19 + y, r > 5.4 || r < 4 ? SPOT.metalDark : SPOT.metalLight)
          }
        }
        for (let y = 0; y < 11; y++) {
          for (let a = -8; a <= 8; a++) {
            const isEdge = y === 0 || y === 10 || Math.abs(a) === 8
            const isCross = Math.abs(Math.abs(a) - Math.abs(y - 5)) < 1 && Math.abs(a) < 4
            this.dot(x + a, foot - 11 + y, isCross ? SPOT.coif : isEdge ? SPOT.robeDark : SPOT.red)
          }
        }
        break
      }
      case 6: {
        // The river, dry; the arrow, snapped.
        for (let dx = -Math.floor(ring.outer - 2); dx <= ring.outer - 2; dx++) {
          const back = Math.round(this.back(i, dx))
          for (let y = back; y < Math.max(back + 2, this.floorAt(i, dx) + 3); y++) this.dot(this.cx + dx, y, noise(Math.round(dx) >> 1, y, 99) < 0.2 ? SPOT.outline : RAMP.rock + 3)
        }
        for (let b = 0; b < 15; b++) {
          const half = b < 7 ? 3 : 14 - b
          if (b === 4 || b === 5) continue
          const lean = b < 4 ? -3 + b * 0 : 1
          for (let a = -half; a <= half; a++) this.dot(cx + a + lean, foot - 19 + b, Math.abs(a) === half ? SPOT.robeDark : SPOT.red)
        }
        break
      }
      case 7: {
        // The chain, parted.
        for (const side of [-1, 1]) {
          for (let b = -6; b <= 6; b++) {
            for (let a = -10; a <= 10; a++) {
              const r = Math.hypot(Math.max(0, Math.abs(a) - 4), b)
              if (r > 6.2 || r < 3 || (a * -side > 5 && Math.abs(b) < 3)) continue
              this.dot(cx - 8 + side * 13 + a, foot - 7 + b + (side > 0 ? 1 : 0), r > 5.4 ? (b < 0 ? SPOT.metalLight : SPOT.metalDark) : r < 3.8 ? SPOT.metalDark : SPOT.metal)
            }
          }
        }
        if (noise(2, tick, 100) < 0.5) for (let n = 0; n < 5; n++) this.dot(cx - 8 + (noise(n, 1, tick) - 0.5) * 10, foot - 8 + (noise(n, 2, tick) - 0.5) * 10, n % 2 === 0 ? SPOT.amber : SPOT.star)
        break
      }
      default: {
        // The television, with nothing on.
        const x = cx + 9
        for (const side of [-1, 1]) for (let k = 0; k < 6; k++) this.dot(x + side * (3 + k), foot - 19 - (side > 0 ? Math.round(k * 0.2) : k), SPOT.metalDark)
        for (let b = 0; b < 19; b++) {
          for (let a = -13; a <= 13; a++) {
            const isScreen = b >= 2 && b <= 15 && a >= -11 && a <= 7
            const n = noise(a, b, tick)
            this.dot(x + a, foot - 18 + b, isScreen ? (n < 0.28 ? SPOT.metalLight : n < 0.5 ? SPOT.metalDark : SPOT.outline) : b === 0 || a === -13 ? SPOT.metal : SPOT.metalDark)
          }
        }
        this.dot(x + 10, foot - 14, SPOT.red)
      }
    }
    // Smoke from it, and the sign to mind, on the side they are not.
    for (let n = 0; n < 7; n++) {
      const life = (t * (0.22 + noise(n, 1, 101) * 0.12) + noise(n, 2, 101)) % 1
      const y = foot - 13 - life * 16
      const x = cx + (noise(n, 3, 101) - 0.5) * 16 + Math.sin(life * 5 + n) * 2
      const r = 0.6 + life * 1.8
      if (!this.isInRoom(i, x, y)) continue
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (Math.hypot(a, b) <= r && bayer(Math.round(x + a), Math.round(y + b)) / 16 > life) this.dot(x + a, y + b, RAMP.stone + 2)
    }
    const side = i % 2 === 0 ? 1 : -1
    const at = Math.round(side * Math.min(ring.outer * (i > 6 ? 0.85 : 0.72), 52))
    if (Math.sin(t * 7) > -0.6) stamp(canvas, WARNING, cx + at, this.floorAt(i, at) - 1)
  }

  /** The fiend at the bottom: a television with horns, stuck in the ice, loading. */
  private paintPlayer(x: number, foot: number): void {
    const { t } = this
    // Rabbit ears for horns.
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) this.dot(x + side * (3 + k), foot - 19 - k, k === 5 ? SPOT.eye : SPOT.metal)
    for (let b = 0; b < 19; b++) {
      for (let a = -13; a <= 13; a++) {
        if ((b === 0 || b === 18) && Math.abs(a) === 13) continue
        const isScreen = b >= 2 && b <= 15 && a >= -11 && a <= 7
        this.dot(x + a, foot - 18 + b, isScreen ? SPOT.outline : b === 0 || a === -13 ? SPOT.metal : SPOT.metalDark)
      }
    }
    const isOn = this.ring === LAST
    this.dot(x + 10, foot - 14, isOn ? SPOT.led : SPOT.eye)
    this.dot(x + 10, foot - 10, isOn ? SPOT.amber : SPOT.metal)
    const cx = x - 2
    const cy = foot - 10
    if (this.labels.lit[4] === true) {
      // It plays.
      for (let a = -4; a <= 5; a++) for (let b = -5; b <= 5; b++) if (Math.abs(b) <= (5 - a) * 0.56) this.dot(cx + a, cy + b, SPOT.led)
    } else if (isOn) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const age = (k - Math.floor(t * 6) + 800) % 8
        const color = age > 5 ? SPOT.screen : age > 3 ? SPOT.blue : SPOT.blueDark
        const dx = Math.round(Math.cos(a) * 4.2)
        const dy = Math.round(Math.sin(a) * 4.2)
        for (const [p, q] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) this.dot(cx + dx + p, cy + dy + q, color)
      }
    }
    for (let a = -15; a <= 15; a++) this.dot(x + a, foot + 1, RAMP.ice + (Math.abs(a) % 3 === 0 ? 6 : 5))
  }

  private paintFire(): void {
    const { w, h, px } = this
    for (let i = 0; i < CIRCLES; i++) {
      const heat = this.heat[i]!
      const colors = FLAME[FLAME_OF[i]!]!
      const ring = this.rings[i]!
      const roof = i === 0 ? this.top + 2 : this.rings[i - 1]!.y + 3
      const left = Math.max(0, Math.ceil(this.cx - ring.outer + 2))
      const right = Math.min(w - 1, Math.floor(this.cx + ring.outer - 2))
      for (let x = left; x <= right; x++) {
        const base = Math.round(this.back(i, x - this.cx)) + 1
        for (let row = 0; row < FIRE_ROWS; row++) {
          const value = heat[row * w + x]!
          const y = base - row
          if (value < 4 || y <= roof || y >= h) continue
          px[y * w + x] = colors[Math.min(colors.length - 1, (value >> 2) - 1)]!
        }
      }
    }
  }

  /** The front edge of each ledge, gold once crossed, and its number in the rock. */
  private paintRims(goal: Goal): void {
    const canvas: Canvas = { w: this.w, h: this.h, px: this.px }
    for (let i = 0; i < CIRCLES; i++) {
      const ring = this.rings[i]!
      const isPast = i < this.ring
      const isHere = i === this.ring
      const beat = 0.5 + 0.5 * Math.sin(this.t * 4)
      for (let dx = -Math.floor(ring.hole); dx <= ring.hole && ring.hole > 0; dx++) {
        const u = dx / ring.hole
        const y = Math.round(ring.y - ring.rim * Math.sqrt(1 - Math.min(1, u * u)))
        this.dot(this.cx + dx, y, isPast ? RAMP.gold + 3 : isHere ? RAMP.gold + 4 : RAMP.stone + 3)
      }
      const from = Math.ceil(ring.hole)
      for (let d = from; d <= ring.outer; d++) {
        const color = isPast ? RAMP.gold + 4 : isHere ? RAMP.gold + (goal.mood === 'running' ? 3 + Math.round(beat * 3) : 5) : i === LAST ? RAMP.ice + 4 : RAMP.stone + 4
        this.dot(this.cx - d, ring.y, color)
        this.dot(this.cx + d, ring.y, color)
      }
      const label = NUMERALS[i]!
      const x = Math.min(this.w - textWidth(label) - 2, Math.round(this.cx + ring.outer + 5))
      const color = isPast ? RAMP.gold + 3 : isHere ? (goal.mood === 'failed' ? SPOT.eye : RAMP.gold + 5) : RAMP.rock + 5
      write(canvas, label, x, ring.y - 6, color)
    }
  }

  // ---- the stars --------------------------------------------------------------------------

  /** The screen of the drive-in, where its picture goes. */
  private screen(): { x: number; y: number; w: number; h: number } {
    const w = Math.round(this.w * 0.66)
    return { x: Math.round(this.w * 0.27), y: Math.round(this.h * 0.4), w, h: Math.round(Math.min(this.h * 0.2, w * 0.62)) }
  }

  private paintSky(): Uint8Array {
    const { w, h } = this
    const sky = new Uint8Array(w * h)
    const ground = Math.round(h * 0.78)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x
        const d = bayer(x, y) / 16
        const hills = h * 0.7 - cloud(x / 26, 3, 80) * h * 0.07
        if (y < hills) {
          const v = y / (h * 0.72)
          const dawn = (v - 0.74) / 0.26
          sky[k] =
            dawn * 1.5 > d + 0.2
              ? RAMP.dawn + Math.min(4, Math.max(0, Math.floor(dawn * 4.6 + d - 0.7)))
              : RAMP.night + Math.min(5, Math.floor(0.6 + v * 4.4 + milky(x, y, w, h) * 1.8 + d))
        } else if (y < ground) {
          sky[k] = RAMP.wood + Math.min(5, Math.floor(0.8 + (y - hills < 2 ? 2.2 : 0) + cloud(x / 5, y / 4, 82) * 1.4 + d * 0.8))
        } else {
          const grain = stones(x, y * 1.8, 9, 1, 81)
          sky[k] = RAMP.rock + Math.min(6, Math.floor(1 + grain.id * 1.3 - (grain.seam < 0.1 ? 0.7 : 0) + d * 0.6))
        }
      }
    }
    const s = this.screen()
    for (let y = s.y - 3; y < ground + 4; y++) {
      for (let x = s.x - 3; x < s.x + s.w + 3; x++) {
        const isFrame = y < s.y + s.h + 3
        const isLeg = [0.18, 0.82].some(u => Math.abs(x - (s.x + s.w * u)) < 2)
        if (isFrame || isLeg) sky[y * w + x] = isFrame ? RAMP.wood + (y === s.y - 3 || x === s.x - 3 ? 5 : 2) : RAMP.wood + (x % 2 === 0 ? 3 : 2)
      }
    }
    return sky
  }

  private paintStars(): Uint8Array {
    const { w, h, t } = this
    const px = this.skyPx
    px.set(this.sky)
    const canvas: Canvas = { w, h, px }
    const ground = Math.round(h * 0.78)
    const set = (x: number, y: number, color: number): void => {
      const X = Math.round(x)
      const Y = Math.round(y)
      if (X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = color
    }
    const star = (x: number, y: number, color: number): void => {
      if (x < 0 || x >= w || y < 0 || y >= h) return
      const k = y * w + x
      if (px[k]! >= RAMP.night && px[k]! < RAMP.night + LEVELS) px[k] = color
    }
    const count = Math.round((w * h * 0.6) / 120)
    for (let n = 0; n < count; n++) {
      const x = Math.floor(noise(n, 1, 90) * w)
      const y = Math.floor(noise(n, 2, 90) * h * 0.58)
      if (n % 3 === 0 && milky(x, y, w, h) < 0.25) continue
      const beat = Math.sin(t * (0.9 + noise(n, 3, 90) * 2.4) + n * 2.1)
      star(x, y, beat > 0.2 ? (n % 7 === 0 ? SPOT.starWarm : SPOT.star) : SPOT.starDim)
    }
    const four: Array<[number, number]> = [[0.2, 0.17], [0.34, 0.1], [0.3, 0.29], [0.44, 0.21]]
    four.forEach(([u, v], n) => {
      const x = Math.round(u * w)
      const y = Math.round(v * h)
      const reach = 2 + Math.round(1.5 + 1.5 * Math.sin(t * 2.2 + n * 1.3))
      for (let k = 1; k <= reach; k++) for (const [a, b] of [[k, 0], [-k, 0], [0, k], [0, -k]] as const) star(x + a, y + b, k < reach - 1 ? SPOT.star : SPOT.starDim)
      for (const [a, b] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) star(x + a, y + b, SPOT.star)
    })
    this.paintFilm(canvas, set)
    // The beam, from the projector behind them.
    const s = this.screen()
    const from = { x: 5, y: ground + 22 }
    for (let x = from.x; x < s.x; x++) {
      const u = (x - from.x) / (s.x - from.x)
      const top = from.y + (s.y - from.y) * u
      const bottom = from.y + (s.y + s.h - from.y) * u
      for (let y = Math.round(top); y <= bottom; y++) {
        if (y < 0 || y >= h || (bayer(x, y) + noise(x, y, Math.floor(t * 14)) * 4) / 16 > 0.3) continue
        set(x, y, RAMP.night + 6)
      }
    }
    // Two seats in front, the cars behind.
    stamp(canvas, CAR, Math.round(w * 0.78), ground + 20)
    stamp(canvas, CAR, Math.round(w * 0.52), ground + 34, false)
    const foot = ground + 26
    stamp(canvas, DANTE[0]!, Math.round(w * 0.2), foot, true)
    stamp(canvas, VIRGIL[0]!, Math.round(w * 0.2) + 16, foot - 2, true)
    stamp(canvas, POPCORN, Math.round(w * 0.2) + 8, foot + 2)
    for (let b = 0; b < 9; b++) for (let a = -5; a <= 5; a++) set(from.x + a, from.y - 3 + b, b === 0 || a === -5 ? SPOT.metal : SPOT.metalDark)
    stamp(canvas, REEL, from.x - 1, from.y - 4)
    set(from.x + 6, from.y, SPOT.starWarm)
    return px
  }

  /** Show this film's logo on the screen, or the title in letters. */
  show(picture: Picture | undefined): void {
    this.picture = picture
    this.logo = undefined
    this.logoFor = undefined
  }

  /** The logo at the size that leaves room for what is written under it. */
  private fitted(caption: string): Logo | undefined {
    if (this.picture === undefined) return undefined
    if (this.logoFor !== (caption !== '')) {
      const s = this.screen()
      this.logoFor = caption !== ''
      this.logo = pixelLogo(this.picture, s.w - 14, s.h - 12 - (caption === '' ? 0 : 11))
      if (this.logo !== undefined) inkLogo(this.logo.colors)
    }
    return this.logo
  }

  /** On the screen: the leader counts down, then the film's logo burns in, or its title is written. */
  private paintFilm(canvas: Canvas, set: (x: number, y: number, color: number) => void): void {
    const { t } = this
    const s = this.screen()
    const cx = s.x + s.w / 2
    const cy = s.y + s.h / 2
    const caption = capitals(this.labels.caption ?? '')
    const logo = this.fitted(caption)
    const beat = (t * 1.5) % (logo === undefined ? 9 : 24)
    const isLeader = beat < 3
    const isDark = logo?.isLight === true && !isLeader
    const flicker = noise(1, Math.floor(t * 20), 92) < 0.12
    for (let y = s.y; y < s.y + s.h; y++) {
      for (let x = s.x; x < s.x + s.w; x++) {
        let color: number = isLeader ? SPOT.togaShade : SPOT.coif
        if (isLeader) {
          const a = (Math.atan2(x - cx, cy - y) + Math.PI * 2) % (Math.PI * 2)
          if (a < (beat % 1) * Math.PI * 2) color = SPOT.hair
          const r = Math.hypot(x - cx, y - cy)
          if (Math.abs(r - s.h * 0.4) < 0.7 || Math.abs(r - s.h * 0.3) < 0.7 || Math.abs(x - cx) < 0.6 || Math.abs(y - cy) < 0.6) color = SPOT.togaDark
        } else {
          const edge = Math.hypot((x - cx) / s.w, (y - cy) / s.h) + (bayer(x, y) / 16) * 0.1
          const isBorder = x === s.x || y === s.y || x === s.x + s.w - 1 || y === s.y + s.h - 1
          if (isDark) color = RAMP.stone + (isBorder ? 4 : edge > 0.56 ? 0 : edge > 0.44 ? 1 : 2)
          else if (edge > 0.52) color = SPOT.togaShade
        }
        if (flicker && bayer(x, y) > 11) color = isDark ? RAMP.stone + 2 : SPOT.togaShade
        set(x, y, color)
      }
    }
    for (let n = 0; n < 2; n++) {
      const x = s.x + Math.floor(noise(n, Math.floor(t * 7), 93) * s.w)
      for (let y = s.y; y < s.y + s.h; y++) if (noise(n, y >> 2, Math.floor(t * 7) + 94) < 0.5) set(x, y, isDark ? RAMP.stone + 3 : SPOT.hair)
    }
    if (isLeader) {
      // A digit, each of its pixels four of these.
      const glyphs: Record<string, string> = { 3: '110001010001110', 2: '110001010100111', 1: '010110010010111' }
      const glyph = glyphs[String(3 - Math.floor(beat))] ?? ''
      for (let k = 0; k < 15; k++) if (glyph[k] === '1') for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) set(cx - 7 + (k % 3) * 5 + a, cy - 12 + Math.floor(k / 3) * 5 + b, SPOT.outline)
      return
    }
    if (logo !== undefined) {
      this.paintLogo(canvas, set, logo, caption, (beat - 3) / 1.5)
      return
    }
    const title = capitals(this.labels.title)
    if (title === '') {
      for (let a = -7; a <= 9; a++) for (let b = -9; b <= 9; b++) if (Math.abs(b) <= (9 - a) * 0.56) set(cx + a, cy + b, SPOT.robeDark)
      return
    }
    const lines = wrap(title, s.w - 10, 4)
    lines.forEach((line, n) => write(canvas, line, Math.round(cx - textWidth(line) / 2), Math.round(cy - lines.length * 4 + n * 8 + 1), SPOT.robeDark))
  }

  /** The logo, `since` seconds after the leader: it burns in from the left, and later a light runs over it. */
  private paintLogo(canvas: Canvas, set: (x: number, y: number, color: number) => void, logo: Logo, caption: string, since: number): void {
    const s = this.screen()
    const jump = noise(1, Math.floor(this.t * 6), 97) < 0.05 ? 1 : 0
    const left = Math.round(s.x + (s.w - logo.w) / 2)
    const top = Math.round(s.y + (s.h - logo.h - (caption === '' ? 0 : 11)) / 2) + jump
    const burnt = since / 2.2
    const shine = ((since - 5) / 1.8) * (logo.w + logo.h)
    const isIn = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < logo.w && y < logo.h && logo.px[y * logo.w + x] !== 0
    /** How long ago it burnt in, as a share; below 0 it has not. */
    const age = (x: number, y: number): number => burnt - ((x / logo.w) * 0.75 + (bayer(x, y) / 16) * 0.12 + noise(x >> 1, y >> 1, 98) * 0.13)
    if (!logo.isLight) {
      // On the bright screen it throws a shadow.
      for (let y = 0; y < logo.h; y++) for (let x = 0; x < logo.w; x++) if (isIn(x, y) && !isIn(x + 1, y + 1) && age(x, y) > 0.1) set(left + x + 1, top + y + 1, SPOT.togaShade)
    }
    for (let y = 0; y < logo.h; y++) {
      for (let x = 0; x < logo.w; x++) {
        if (!isIn(x, y)) continue
        const old = age(x, y)
        if (old < 0) continue
        const isShining = Math.abs(x + y - shine) < 3
        const ember = RAMP.fire + Math.max(3, 6 - Math.floor(old * 34))
        set(left + x, top + y, old < 0.1 ? ember : isShining ? SPOT.star : LOGO + logo.px[y * logo.w + x]! - 1)
      }
    }
    if (caption === '' || since < 2.6) return
    const line = wrap(caption, s.w - 10, 1)[0] ?? ''
    write(canvas, line, Math.round(s.x + (s.w - textWidth(line)) / 2), s.y + s.h - 12 + jump, logo.isLight ? RAMP.gold + 4 : SPOT.robeDark)
  }
}

/** The Milky Way: a soft band across the sky. */
function milky(x: number, y: number, w: number, h: number): number {
  const along = x / w - y / (h * 0.75) + 0.28
  return Math.max(0, 1 - Math.abs(along) * 3.2) * (0.35 + cloud(x / 7, y / 7, 95) * 0.9)
}
