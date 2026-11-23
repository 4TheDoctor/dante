// The high-resolution Inferno of downloads: nine circles in a cut-away pit, lit by simulated fire,
// from the catalogue down to the player. Dante and his robot guide wait before the gate, cross the
// torrent, walk the ledges and climb down as the request really advances, and come out to a film
// under the stars when it is done. Pixels are palette indexes (palette.ts).
import { FLAME, LEVELS, RAMP, SPOT, type RampName } from './palette.js'
import { CACHED, capitals, CAR, CERBERUS, CRATE, DANTE, DRONE, FERRYMAN, FILE, FOSSILS, GERYON, KEY_RING, LEECHER, MAGNET, MINOS, POPCORN, REEL, SEEDER, stamp, textWidth, TOMB, UNCACHED, VIRGIL, wrap, write, writeBig, type Canvas } from './sprites.js'

export type Mood = 'idle' | 'running' | 'done' | 'failed'

/** What is cut in the rock: all of it comes from the request itself. */
export interface Labels {
  /** The nine circles, top to bottom. */
  circles: readonly string[]
  /** What is being looked for, on the marquee over the gate; and what it says with nothing asked. */
  title: string
  ask: string
  /** What each of the five steps found: results, cache, download… Empty until it has. */
  facts: readonly string[]
  /** Which of the five steps are done, and which one is under way (-1: none). */
  lit: readonly boolean[]
  now: number
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
const NAME = ['DEBRID AGGREGATOR &', 'NAVIGATOR TRACKER ENGINE'] as const
/** How fast the world around them moves. */
const CALM = 0.55
/** Seconds between two steps of the fire. */
const FIRE_BEAT = 0.11
const LETTERS = ['D', 'A', 'N', 'T', 'E']
const NO_LABELS: Labels = { circles: [], title: '', ask: '', facts: [], lit: [], now: -1 }
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const WALL: readonly RampName[] = ['earth', 'blood', 'earth', 'stone', 'bog', 'fire', 'blood', 'fire', 'ice']
const FIREWALL = 5
const FLAME_OF = [1, 0, 0, 0, 0, 0, 0, 0, 2]

interface Ring {
  /** Front line of the ledge. */
  y: number
  /** Half widths: of the room, and of the hole the next room is seen through. */
  outer: number
  hole: number
  /** How far back the ledge curves. */
  bow: number
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
function cloud(x: number, y: number, n: number): number {
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
  private readonly masts: Array<{ x: number; y: number }> = []
  t = 0
  stars = 0
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
    this.top = Math.max(67, Math.round(h * 0.175))
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
        bow: Math.max(5, Math.min(tall * 0.36, outer * 0.2)),
        tall,
      })
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
    const isInHole = ring.hole > 0 && (ax / ring.hole) ** 2 + (up / (ring.bow * (ring.hole / ring.outer))) ** 2 <= 1

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
      this.put(x, y, ramp, 1.5 + front * 1.4 + grain.id * 0.8 - (grain.seam < 0.1 ? 1 : 0), i, up * 0.6)
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

  /** The dark wood: bare trees and dead antennas on both sides of the gate. */
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
          this.put(Math.round(X) + k, Math.round(Y), 'wood', k === 0 ? 3.2 : 2 - (k > 1 ? 0.8 : 0))
        }
        if (length > 6 && s > steps * 0.35 && noise(n, s, 16) < 0.24) {
          const side = noise(n, s, 17) < 0.5 ? -1 : 1
          branch(X, Y, a + side * (0.5 + noise(n, s, 18) * 0.6), length * 0.5, thick * 0.5, n * 7 + s)
        }
      }
    }
    const mast = (x: number, tall: number, n: number): void => {
      for (let y = ground - tall; y <= ground; y++) this.put(x, y, 'wood', 4)
      const bars = 3 + (n % 2)
      for (let b = 0; b < bars; b++) {
        const half = 7 - b
        const y = ground - tall + 3 + b * 3
        for (let k = -half; k <= half; k++) this.put(x + k, y, 'wood', Math.abs(k) === half ? 5 : 3.4)
      }
      // A dish half way up.
      if (n % 2 === 0) for (let k = 0; k < 7; k++) for (let b = 0; b <= Math.min(k, 6 - k); b++) this.put(x + 2 + b, ground - Math.round(tall * 0.45) + k - 3, 'stone', b === 0 ? 3.6 : 2.2)
      this.masts.push({ x, y: ground - tall - 1 })
    }
    const gate = 30
    const spots = Math.max(2, Math.floor((this.cx - gate) / 10))
    for (let side = -1; side <= 1; side += 2) {
      for (let n = 0; n < spots; n++) {
        const x = Math.round(this.cx + side * (gate + 4 + n * 10 + noise(n, side + 2, 19) * 5))
        if ((n + (side > 0 ? 1 : 0)) % 2 === 0) mast(x, Math.round(ground * (0.45 + noise(n, side + 2, 22) * 0.35)), n)
        else branch(x, ground, -Math.PI / 2 + (noise(n, side + 2, 20) - 0.5) * 0.3, ground * (0.55 + noise(n, side + 2, 21) * 0.35), 3, n * 13 + side * 5 + 40)
      }
    }
  }

  /** The gate: a door between two racks, under a marquee, under the neon with the name. */
  private gate(): { ground: number; door: number; marquee: number; neon: number; board: number; sign: number } {
    const ground = this.bank - 1
    const marquee = ground - 35
    return { ground, door: ground - 18, marquee, neon: marquee - 17, board: Math.min(44, (this.w >> 1) - 5), sign: Math.min(53, (this.w >> 1) - 3) }
  }


  private buildGate(): void {
    const cx = Math.round(this.cx)
    const { ground, door, marquee, neon, board, sign } = this.gate()
    for (let y = door; y <= ground; y++) {
      for (let x = cx - 23; x <= cx + 23; x++) {
        const ax = Math.abs(x - cx)
        // Firelight from below comes up through the door; the racks stand on both sides.
        if (ax < 13) this.put(x, y, 'fire', Math.max(0, (y - ground + 15) / 5.5), 0, 34)
        else this.put(x, y, 'stone', ax === 13 || ax === 23 || y === door ? 3 : (y - door) % 4 === 0 ? 0.6 : 1.5, 0, 40)
      }
    }
    for (let y = marquee; y < marquee + 17; y++) {
      for (let x = cx - board; x <= cx + board; x++) this.put(x, y, 'gold', Math.abs(x - cx) === board || y === marquee || y === marquee + 16 ? 3 : 1.4)
    }
    for (let y = neon; y < neon + 16; y++) {
      for (let x = cx - sign; x <= cx + sign; x++) this.put(x, y, 'stone', Math.abs(x - cx) === sign || y === neon || y === neon + 15 ? 2.6 : 0.5)
    }
  }

  /** Steps cut in the wall: right, then left, then right… from each ledge to the next. */
  private stairAlong(i: number): number {
    return i % 2 === 0 ? 0.84 : 0.16
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
    const radius = i === LAST ? ring.outer * 0.86 : (ring.outer + ring.hole) / 2
    const angle = Math.PI * (1 - along)
    const scale = radius / ring.outer
    return { x: Math.round(this.cx + radius * Math.cos(angle)), y: Math.round(ring.y - ring.bow * scale * Math.sin(angle) * 0.9) }
  }

  // ---- what moves -------------------------------------------------------------------------

  /** Virgil walks to where the goal is, taking the stairs; Dante follows his steps. */
  private walk(goal: Goal, dt: number): void {
    const wanted = Math.max(-1, Math.min(LAST, goal.depth))
    const here = this.ring + this.climb
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
    } else if (goal.mood === 'running' && this.climb === 0) {
      if (this.along > 0.74) this.heading = -1
      if (this.along < 0.26) this.heading = 1
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
    const ring = this.rings[Math.max(0, this.ring)]!
    const u = Math.min(1, Math.abs(dx) / ring.outer)
    return { x, y: this.climb > 0 ? lead.y : Math.round(ring.y - ring.bow * Math.sqrt(1 - u * u) * 0.72), right: lead.right }
  }

  /** How hot each circle burns: embers everywhere, a blaze where the work is. */
  private heatOf(i: number, goal: Goal): number {
    const near = this.ring < 0 && this.climb < CROSSED ? 0 : Math.max(0, 1 - Math.abs(i - (this.ring + this.climb)) / 1.9)
    if (goal.mood === 'failed') return 0.55 + near * 0.45
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
    const many = goal.mood === 'running' || goal.mood === 'failed' ? 46 : 16
    if (this.sparks.length < many && this.random() < 0.8) {
      const i = Math.min(LAST - 1, Math.max(1, this.ring + (this.random() < 0.6 ? 0 : Math.floor(this.random() * 4) - 1)))
      const ring = this.rings[i]!
      this.sparks.push({ x: this.cx + (this.random() - 0.5) * 2 * ring.outer * 0.9, y: ring.y - ring.bow * 0.6, vx: 0, vy: -(5 + this.random() * 12), life: 1 + this.random() * 1.6 })
    }
    for (let n = this.sparks.length - 1; n >= 0; n--) {
      const spark = this.sparks[n]!
      spark.vx += (this.random() - 0.5) * 60 * dt
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      spark.life -= dt
      if (spark.life <= 0 || spark.y < 2) this.sparks.splice(n, 1)
    }
  }

  /** Nothing left to walk or fade: only the fire moves. */
  isSettled(goal: Goal): boolean {
    const there = Math.abs(this.ring + this.climb - Math.max(-1, Math.min(LAST, goal.depth))) < 0.02
    return there && this.stars === (goal.isDone ? 1 : 0)
  }

  // ---- painting ---------------------------------------------------------------------------

  /** Move everything on by `dt` seconds and paint it. The same array is reused for each frame. */
  frame(goal: Goal, dt: number): Uint8Array {
    this.t += dt * CALM
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
    const isAlarm = goal.mood === 'failed'
    // Light of each circle's fire by distance, flickering, in 16ths of a level.
    const light = new Int16Array(CIRCLES * DISTANCES)
    for (let i = 0; i < CIRCLES; i++) {
      const flicker = 0.88 + cloud(this.t * 5, i * 4, 50) * 0.24
      const glow = this.warmth[i]! * flicker * (isAlarm ? 1.15 : 1)
      for (let d = 0; d < DISTANCES; d++) light[i * DISTANCES + d] = Math.round(glow * 62 * Math.exp(-d / 17) + (this.warmth[i]! - 0.1) * 8)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x
        const of = lit[k]!
        const value = level[k]! + (of < 0 ? 0 : light[of * DISTANCES + far[k]!]!) + bayer(x, y) - 8
        const step = value < 0 ? 0 : value >> 4
        px[k] = ramp[k]! + (step >= LEVELS ? LEVELS - 1 : step)
      }
    }
    const lead = this.virgil()
    const follow = this.dante(lead)
    this.paintLantern(lead)
    this.paintGate()
    this.paintAcheron()
    const canvas: Canvas = { w, h, px }
    this.paintFire()
    for (let i = 0; i < CIRCLES; i++) this.paintCircle(i, canvas)
    this.paintRims(goal)
    this.paintNames(canvas)
    this.paintPlaques(goal, canvas)
    const isMoving = this.climb > 0 || goal.mood === 'running' || goal.depth > this.ring + this.climb + 0.01
    const pose = isMoving ? Math.floor(this.walked / 5) % 4 : 0
    const figures: Array<[readonly string[], Step]> = [[VIRGIL[pose]!, lead], [DANTE[(pose + 2) % 4]!, follow]]
    figures.sort((a, b) => a[1].y - b[1].y)
    for (const [art, at] of figures) stamp(canvas, art, at.x, at.y + 1, at.right)
    this.paintBoat(canvas)
    for (const spark of this.sparks) {
      const x = Math.round(spark.x)
      const y = Math.round(spark.y)
      if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = FLAME[0]![spark.life > 1.2 ? 7 : spark.life > 0.6 ? 5 : 3]!
    }
  }

  private paintGate(): void {
    const { w, h, px, t } = this
    const canvas: Canvas = { w, h, px }
    const cx = Math.round(this.cx)
    const { ground, door, marquee, neon, board, sign } = this.gate()
    // The name in neon, its five initials brighter.
    const lines = sign >= 52 ? NAME : wrap(NAME.join(' '), sign * 2 - 5, 2)
    const hum = noise(7, Math.floor(t * 9), 61) < 0.06 ? 3 : 5
    lines.forEach((line, n) => {
      let x = cx - (textWidth(line) >> 1)
      ;[...line].forEach((letter, k) => {
        const isInitial = letter !== '&' && (k === 0 || line[k - 1] === ' ')
        x = write(canvas, letter, x, neon + 2 + n * 7, isInitial ? SPOT.laurelGold : FLAME[0]![hum]!)
      })
    })
    // The marquee: what is on, with running lights around it.
    for (let y = marquee + 2; y < marquee + 15; y++) for (let x = cx - board + 2; x <= cx + board - 2; x++) this.dot(x, y, SPOT.coif)
    for (let x = -board; x <= board; x += 3) {
      const isOn = (Math.floor(x / 3) + Math.floor(t * 4)) % 3 !== 0
      this.dot(cx + x, marquee, isOn ? SPOT.amber : SPOT.amberDark)
      this.dot(cx + x, marquee + 16, isOn ? SPOT.amber : SPOT.amberDark)
    }
    const room = board * 2 - 6
    const title = capitals(this.labels.title)
    const said = wrap(title === '' ? capitals(this.labels.ask) : title, room, 2)
    said.forEach((line, n) => write(canvas, line, cx - (textWidth(line) >> 1), marquee + (said.length === 1 ? 6 : 3 + n * 6), title === '' ? SPOT.boneDark : SPOT.robeDark))
    // Lights of the racks, the masts, and eyes in the wood.
    for (const side of [-1, 1]) {
      for (let y = door + 2; y < ground; y += 4) {
        for (let k = 0; k < 3; k++) {
          const is = noise(k + side * 5, y, Math.floor(t * 5 + k) + 62)
          if (is > 0.35) this.dot(cx + side * (16 + k * 2), y, is > 0.92 ? SPOT.amber : SPOT.led)
        }
      }
    }
    this.masts.forEach(({ x, y }, n) => {
      if (Math.sin(t * 2.4 + n * 1.9) > 0.3) this.dot(x, y, SPOT.eye)
    })
    const eyes: Array<[number, number]> = [[0.05, ground - 7], [0.9, ground - 5], [0.96, ground - 13]]
    eyes.forEach(([u, y], n) => {
      if (noise(n, Math.floor(t * 1.1 + n * 0.7), 60) < 0.3) return
      for (const dx of [0, 3]) this.dot(Math.round(u * w) + dx, y, SPOT.eyeYellow)
    })
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
        if (px[k]! - ramp[k]! < LEVELS - 1) px[k] = px[k]! + 1
      }
    }
  }

  /** The river is the torrent: packets come down it without end. */
  private paintAcheron(): void {
    const { t } = this
    for (let y = this.bank + 1; y < this.top; y++) {
      for (let x = 0; x < this.w; x++) {
        const wave = Math.sin(x * 0.22 + t * 1.6 + y * 2.4) + Math.sin(x * 0.09 - t + y * 1.3)
        if (wave > 1.5) this.dot(x, y, RAMP.sea + 5)
        else if (wave > 0.95) this.dot(x, y, RAMP.sea + 3)
      }
    }
    for (let n = 0; n < 16; n++) {
      const x = (noise(n, 1, 63) * this.w + t * (9 + noise(n, 2, 63) * 10)) % (this.w + 6)
      const y = this.bank + 2 + Math.floor(noise(n, 3, 63) * (this.top - this.bank - 5)) + Math.round(Math.sin(t * 2 + n) * 0.6)
      const color = [SPOT.green, SPOT.blue, SPOT.amber, SPOT.screen][n % 4]!
      for (let b = 0; b < 2; b++) for (let a = 0; a < 3; a++) this.dot(this.w - x + a, y + b, b === 0 ? color : SPOT.blueDark)
    }
  }

  /** Charon's boat, a magnet for a sail, over the feet of those it carries. */
  private paintBoat(canvas: Canvas): void {
    const x = this.boatX()
    const y = this.top - 4 + Math.round(Math.sin(this.t * 2.6) * 0.8)
    const isRowing = this.ring < 0 && this.climb > BOARDED && this.climb < CROSSED
    for (let k = 0; k < 24; k++) this.dot(x - 20, y - k, SPOT.hullLight)
    stamp(canvas, MAGNET, x - 14, y - 15)
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
      const y = roof + (i === LAST || i === 0 ? 1 : 5)
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

  /** What goes on in each circle. */
  private paintCircle(i: number, canvas: Canvas): void {
    const { t, labels } = this
    const ring = this.rings[i]!
    const floor = (u: number): number => this.back(i, u * ring.outer) + 1
    const at = (u: number): number => Math.round(this.cx + u * ring.outer)
    switch (i) {
      case 0: {
        // Catalogue: the video shop. Posters on the wall, tapes on the shelf.
        const hues = [SPOT.red, SPOT.blue, SPOT.amber, SPOT.violet, SPOT.green, SPOT.screen, SPOT.robeDark]
        for (let n = -5; n <= 5; n++) {
          if (Math.abs(n) < 2) continue
          const x = Math.round(this.cx + n * 10.5)
          if (Math.abs(x - this.cx) > ring.outer - 8) continue
          const base = Math.round(floor((n * 10.5) / ring.outer)) - 3
          const hue = hues[(n + 5) % hues.length]!
          for (let b = 0; b < 12; b++) {
            for (let a = -4; a <= 4; a++) {
              const isFrame = b === 0 || b === 11 || Math.abs(a) === 4
              const figure = Math.hypot(a, b - 5) < 2.4 || (b >= 7 && Math.abs(a) <= b - 6)
              this.dot(x + a, base - 11 + b, isFrame ? SPOT.hullLight : figure ? SPOT.outline : b < 3 ? SPOT.coif : hue)
            }
          }
          // A lamp sweeps over them, choosing.
          if (Math.abs(Math.sin(t * 0.5) * 5.4 - n) < 0.55) for (let a = -4; a <= 4; a++) this.dot(x + a, base - 13, SPOT.window)
          for (let a = -5; a <= 5; a++) this.dot(x + a, base + 1, a % 3 === 0 ? SPOT.outline : [SPOT.metalDark, SPOT.robeDark, SPOT.blueDark][(n + a + 30) % 3]!)
        }
        // The counter, a reel turning on it.
        const counter = Math.round(floor(0)) + 1
        for (let a = -13; a <= 13; a++) for (let b = 0; b < 5; b++) this.dot(this.cx + a, counter - b, b === 4 ? SPOT.hullLight : (a + 20) % 6 === 0 ? SPOT.outline : SPOT.hull)
        stamp(canvas, REEL, Math.round(this.cx), counter - 5, Math.floor(t * 4) % 2 === 0)
        break
      }
      case 1: {
        // Indexers: a storm of magnets and torrents, more of them the more there is to choose from,
        // and the judge whose cable gives the sentence.
        for (let n = 0; n < 34; n++) {
          const life = (t * (0.34 + noise(n, 1, 71) * 0.3) + noise(n, 2, 71)) % 1
          const u = life * 2 - 1
          const y = ring.y - ring.tall * (0.28 + noise(n, 3, 71) * 0.6) + Math.sin(life * 9 + n) * 3
          for (let k = 0; k < 5; k++) {
            const x = this.cx + u * ring.outer - k
            if (this.isInRoom(i, x, y)) this.dot(x, y, RAMP.blood + (k < 2 ? 5 : 4))
          }
        }
        const many = labels.results === undefined ? 4 : Math.max(5, Math.min(11, 4 + Math.round(labels.results / 25)))
        for (let n = 0; n < many; n++) {
          const a = t * (0.55 + (n % 3) * 0.12) + n * 2.4
          const x = Math.round(this.cx - 6 + Math.cos(a) * ring.outer * (0.35 + (n % 4) * 0.12))
          const y = Math.round(ring.y - ring.tall * 0.42 + Math.sin(a * 1.6 + n) * 6)
          if (this.isInRoom(i, x, y - 4)) stamp(canvas, n % 2 === 0 ? MAGNET : FILE, x, y, Math.sin(a) < 0)
        }
        for (let k = 0; k < 40; k++) {
          const a = k * 0.19 + Math.sin(t * 1.4) * 0.3
          const r = 11 - k * 0.2
          this.dot(at(0.56) + Math.cos(a) * r, floor(0.56) - 8 + Math.sin(a) * r * 0.8, SPOT.blue)
          this.dot(at(0.56) + Math.cos(a) * r + 1, floor(0.56) - 8 + Math.sin(a) * r * 0.8, SPOT.blueDark)
        }
        stamp(canvas, MINOS, at(0.56), Math.round(floor(0.56)) + 2, false)
        break
      }
      case 2: {
        // Trackers: a rain of bits on the dog with three heads, each head listening.
        for (let n = 0; n < 26; n++) {
          const life = (t * (0.42 + noise(n, 1, 72) * 0.3) + noise(n, 2, 72)) % 1
          const x = Math.round(this.cx + (noise(n, 3, 72) * 2 - 1) * ring.outer * 0.92)
          const y = Math.round(ring.y - ring.tall + life * (ring.tall - 4))
          if (this.isInRoom(i, x - 2, y) && this.isInRoom(i, x + 4, y + 5)) write(canvas, noise(n, Math.floor(life * 6), 73) < 0.5 ? '0' : '1', x, y, n % 4 === 0 ? SPOT.green : SPOT.greenDark)
        }
        const x = Math.round(this.cx + Math.sin(t * 0.35) * 16)
        const isLeft = Math.cos(t * 0.35) < 0
        const y = Math.round(floor(0)) + 3
        stamp(canvas, CERBERUS[Math.sin(t * 2.6) > 0.2 ? 1 : 0]!, x, y, isLeft)
        for (let n = 0; n < 3; n++) {
          const wave = (t * 0.7 + n * 0.33) % 1
          const hx = x + (isLeft ? -1 : 1) * (12 - n * 6)
          for (let k = -4; k <= 4; k++) {
            const a = -Math.PI / 2 + k * 0.17
            this.dot(hx + Math.cos(a) * (4 + wave * 8), y - 13 + Math.sin(a) * (4 + wave * 8), wave < 0.6 ? SPOT.led : SPOT.greenDark)
          }
        }
        break
      }
      case 3:
        // Seeders and leechers push at each other, and back: the ratio.
        for (const side of [-1, 1]) {
          const u = side * (0.2 + 0.4 * (0.5 + 0.5 * Math.cos(t * 0.8)))
          const x = at(u)
          const y = Math.round(floor(u))
          const who = side < 0 ? SEEDER : LEECHER
          stamp(canvas, CRATE, x, y)
          const bob = (n: number): number => (Math.sin(t * 3 + n) > 0.4 ? 1 : 0)
          stamp(canvas, who, x + side * 11, y + 1 - bob(1), side < 0)
          stamp(canvas, who, x + side * 20, y + 2 - bob(2.6), side < 0)
        }
        break
      case 4: {
        // Cache: a green lake; on it, a cloud for each release looked up, lit if it is there.
        for (let x = Math.ceil(this.cx - ring.outer + 3); x < this.cx + ring.outer - 3; x++) {
          const dx = x - this.cx
          for (let y = Math.round(this.back(i, dx)); y < ring.y; y++) {
            const isInHole = (dx / ring.hole) ** 2 + ((ring.y - y) / (ring.bow * (ring.hole / ring.outer))) ** 2 <= 1
            if (isInHole) continue
            const wave = Math.sin(x * 0.35 + t * 1.6 + y * 0.9) + Math.sin(x * 0.13 - t * 0.9)
            if (wave > 1.1) this.dot(x, y, RAMP.bog + 5)
            else if (wave > 0.4) this.dot(x, y, RAMP.bog + 3)
          }
        }
        const known = labels.checked !== undefined
        const many = Math.min(5, known ? labels.checked! : 4)
        for (let n = 0; n < many; n++) {
          const u = many === 1 ? 0 : -0.68 + (n / (many - 1)) * 1.36
          const isIn = known && n < (labels.cached ?? 0)
          stamp(canvas, isIn ? CACHED : UNCACHED, at(u), Math.round(floor(u) - 8 + Math.sin(t * 1.1 + n * 1.7) * 1.5))
        }
        const u = Math.sin(t * 0.3) * 0.45
        const x = at(u)
        const y = Math.round(floor(u)) + 2 + Math.round(Math.sin(t * 2) * 0.7)
        const isRight = Math.cos(t * 0.3) > 0
        stamp(canvas, FERRYMAN, x - (isRight ? 7 : -7), y - 1, isRight)
        stamp(canvas, CRATE, x + (isRight ? 6 : -6), y)
        for (let a = -14; a <= 14; a++) for (let b = 0; b < 4 - Math.max(0, Math.abs(a) - 11); b++) this.dot(x + a, y - Math.max(0, Math.abs(a) - 11) + b, b === 0 ? SPOT.hullLight : SPOT.hull)
        break
      }
      case 5:
        // Firewall: the wall itself burns, and before it the files that were taken down.
        for (let x = Math.ceil(this.cx - ring.outer + 2); x < this.cx + ring.outer - 2; x++) {
          const roof = this.back(i - 1, (x - this.cx) * (this.rings[i - 1]!.hole / ring.outer)) + this.rings[i - 1]!.bow * 0.75
          if (Math.floor((x + 400) / 4) % 2 === 0) for (let b = 0; b < 3; b++) this.dot(x, roof + 10 + b, RAMP.fire + (b === 0 ? 4 : 3))
          for (let k = 0; k < 4; k++) if (noise(x, k, 75 + Math.floor(t * 8)) < 0.34 - k * 0.07) this.dot(x, roof + 9 - k, FLAME[0]![7 - k]!)
        }
        for (let n = -2; n <= 2; n++) {
          const u = (n / 2) * 0.74
          const y = Math.round(floor(u)) + 1
          for (let k = 0; k < 9; k++) {
            const sway = Math.sin(t * 7 + n * 2 + k * 0.7)
            const half = Math.max(0, 5 - k * 0.6)
            for (let a = -Math.round(half); a <= Math.round(half); a++) this.dot(at(u) + a + sway * k * 0.16, y - 9 - k, FLAME[0]![Math.max(2, 7 - k)]!)
          }
          stamp(canvas, TOMB, at(u), y)
        }
        break
      case 6: {
        // Debrid: the river is the download, and fills with it. A drone brings the crates.
        const percent = labels.percent ?? 0
        const left = Math.ceil(this.cx - ring.outer + 2)
        const right = Math.floor(this.cx + ring.outer - 2)
        for (let x = left; x <= right; x++) {
          const back = Math.round(this.back(i, x - this.cx))
          const isFull = ((x - left) / (right - left)) * 100 < percent
          for (let y = back; y < back + 5; y++) {
            const wave = Math.sin(x * 0.5 + t * 3 + y) + Math.sin(x * 0.21 - t * 2.1)
            this.dot(x, y, isFull ? (wave > 0.9 ? SPOT.led : wave > -0.4 ? SPOT.green : SPOT.greenDark) : wave > 0.9 ? SPOT.bloodLight : wave > -0.4 ? SPOT.blood : RAMP.blood + 2)
          }
        }
        for (let n = 0; n < 14; n++) {
          const life = (t * (0.22 + noise(n, 1, 76) * 0.16) + noise(n, 2, 76)) % 1
          const x = this.cx + (noise(n, 3, 76) * 2 - 1) * ring.outer * 0.88
          const y = ring.y - ring.tall + life * (ring.tall - 5)
          if (this.isInRoom(i, x, y + 3)) {
            // A small arrow down.
            this.dot(x, y, SPOT.amber)
            this.dot(x, y + 1, SPOT.amber)
            for (const a of [-1, 0, 1]) this.dot(x + a, y + 2, SPOT.amber)
            this.dot(x, y + 3, SPOT.amber)
          }
        }
        const u = Math.sin(t * 0.4) * 0.5
        const y = Math.round(ring.y - ring.tall * 0.42 + Math.sin(t * 1.6) * 1.5)
        stamp(canvas, DRONE[Math.floor(t * 12) % 2]!, at(u), y)
        this.dot(at(u), y + 1, SPOT.outline)
        stamp(canvas, CRATE, at(u), y + 11)
        break
      }
      case 7: {
        // Links: chains across the dark, the keys that open them, and a serpent of network cable.
        for (let n = -1; n <= 1; n++) {
          for (let a = -13; a <= 13; a++) {
            const x = Math.round(this.cx + n * ring.outer * 0.55 + a)
            const y = Math.round(floor(n * 0.55) - 14 + (a * a) / 34 + Math.sin(t * 1.2 + n) * 0.8)
            const k = ((a % 5) + 5) % 5
            if (!this.isInRoom(i, x, y)) continue
            this.dot(x, y - (k < 3 ? 1 : 0), SPOT.metalLight)
            if (k < 3) this.dot(x, y + 1, SPOT.metalDark)
            if (k === 0 || k === 2) this.dot(x, y, SPOT.metal)
          }
        }
        for (let n = 0; n < 4; n++) {
          const u = -0.75 + n * 0.5
          stamp(canvas, KEY_RING, at(u), Math.round(floor(u) - 3 + Math.sin(t * 1.8 + n * 1.4) * 1.6), n % 2 === 0)
        }
        stamp(canvas, GERYON[Math.sin(t * 3) > 0 ? 0 : 1]!, Math.round(this.cx + Math.sin(t * 0.5) * ring.outer * 0.42), Math.round(ring.y - ring.tall * 0.36 + Math.sin(t * 1.1) * 2), Math.cos(t * 0.5) < 0)
        break
      }
      default: {
        // Player: everything frozen, waiting for it to buffer.
        this.paintPlayer(this.cx + 8, ring.y - ring.bow * 0.3)
        for (let n = 0; n < 22; n++) {
          const life = (t * (0.14 + noise(n, 1, 78) * 0.12) + noise(n, 2, 78)) % 1
          const x = this.cx + (noise(n, 3, 78) * 2 - 1) * ring.outer * 0.95 + Math.sin(life * 7 + n) * 3
          const y = ring.y - ring.tall + life * ring.tall
          if (this.isInRoom(i, x, y)) this.dot(x, y, noise(n, 4, 78) < 0.4 ? SPOT.snow : RAMP.ice + 5)
        }
      }
    }
  }

  /** The fiend at the bottom: a television with horns and wings, stuck in the ice, loading. */
  private paintPlayer(x: number, foot: number): void {
    const { t } = this
    const flap = Math.sin(t * 2.1)
    for (const side of [-1, 1]) {
      for (let d = 8; d <= 28; d++) {
        const u = (d - 8) / 20
        const top = foot - 13 - Math.sin(u * 2.5 + 0.2) * (9 + flap * 4) + u * u * (5 - flap * 4)
        const bottom = foot - 5 - u * 2 - Math.abs(Math.sin(u * Math.PI * 3)) * 4 - flap * u * 2
        for (let y = top; y <= bottom; y++) this.dot(x + side * d, y, y < top + 1.2 || Math.abs(Math.sin(u * Math.PI * 3)) < 0.16 ? SPOT.demonLight : SPOT.demon)
      }
      // Rabbit ears for horns.
      for (let k = 0; k < 8; k++) this.dot(x + side * (3 + k * 0.8), foot - 20 - k, k === 7 ? SPOT.eye : SPOT.metal)
    }
    for (let b = 0; b < 20; b++) {
      for (let a = -12; a <= 12; a++) {
        const isCorner = (b === 0 || b === 19) && Math.abs(a) === 12
        if (isCorner) continue
        const isEdge = b === 0 || a === -12
        const isScreen = b >= 2 && b <= 14 && a >= -10 && a <= 6
        this.dot(x + a, foot - 19 + b, isScreen ? SPOT.outline : isEdge ? SPOT.metal : SPOT.metalDark)
      }
    }
    // Knobs, and a mouth of speaker grille.
    this.dot(x + 9, foot - 15, SPOT.eye)
    this.dot(x + 9, foot - 11, SPOT.amber)
    for (let a = -8; a <= 6; a += 2) this.dot(x + a, foot - 2, SPOT.outline)
    const cx = x - 2
    const cy = foot - 11
    if (this.labels.lit[4] === true) {
      // It plays.
      for (let a = -3; a <= 4; a++) for (let b = -4; b <= 4; b++) if (Math.abs(b) <= (4 - a) * 0.6) this.dot(cx + a, cy + b, SPOT.led)
    } else {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const age = (k - Math.floor(t * 9) + 800) % 8
        const color = age > 5 ? SPOT.screen : age > 3 ? SPOT.blue : SPOT.blueDark
        const dx = Math.round(Math.cos(a) * 4.2)
        const dy = Math.round(Math.sin(a) * 4.2)
        for (const [p, q] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) this.dot(Math.round(cx) + dx + p, Math.round(cy) + dy + q, color)
      }
    }
    for (let a = -14; a <= 14; a++) this.dot(x + a, foot + 1, RAMP.ice + (Math.abs(a) % 3 === 0 ? 6 : 5))
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
        const y = Math.round(ring.y - ring.bow * (ring.hole / ring.outer) * Math.sqrt(1 - Math.min(1, u * u)))
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

  /** On the screen: the leader counts down, then the title. */
  private paintFilm(canvas: Canvas, set: (x: number, y: number, color: number) => void): void {
    const { t } = this
    const s = this.screen()
    const cx = s.x + s.w / 2
    const cy = s.y + s.h / 2
    const beat = (t * 1.5) % 9
    const isLeader = beat < 3
    const flicker = noise(1, Math.floor(t * 20), 92) < 0.12
    for (let y = s.y; y < s.y + s.h; y++) {
      for (let x = s.x; x < s.x + s.w; x++) {
        let color: number = isLeader ? SPOT.togaShade : SPOT.coif
        if (isLeader) {
          const a = (Math.atan2(x - cx, cy - y) + Math.PI * 2) % (Math.PI * 2)
          if (a < (beat % 1) * Math.PI * 2) color = SPOT.hair
          const r = Math.hypot(x - cx, y - cy)
          if (Math.abs(r - s.h * 0.4) < 0.7 || Math.abs(r - s.h * 0.3) < 0.7 || Math.abs(x - cx) < 0.6 || Math.abs(y - cy) < 0.6) color = SPOT.togaDark
        } else if (Math.hypot((x - cx) / s.w, (y - cy) / s.h) > 0.52 - (bayer(x, y) / 16) * 0.1) color = SPOT.togaShade
        if (flicker && bayer(x, y) > 11) color = SPOT.togaShade
        set(x, y, color)
      }
    }
    for (let n = 0; n < 2; n++) {
      const x = s.x + Math.floor(noise(n, Math.floor(t * 7), 93) * s.w)
      for (let y = s.y; y < s.y + s.h; y++) if (noise(n, y >> 2, Math.floor(t * 7) + 94) < 0.5) set(x, y, SPOT.hair)
    }
    if (isLeader) {
      // A digit, each of its pixels four of these.
      const glyphs: Record<string, string> = { 3: '110001010001110', 2: '110001010100111', 1: '010110010010111' }
      const glyph = glyphs[String(3 - Math.floor(beat))] ?? ''
      for (let k = 0; k < 15; k++) if (glyph[k] === '1') for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) set(cx - 7 + (k % 3) * 5 + a, cy - 12 + Math.floor(k / 3) * 5 + b, SPOT.outline)
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
}

/** The Milky Way: a soft band across the sky. */
function milky(x: number, y: number, w: number, h: number): number {
  const along = x / w - y / (h * 0.75) + 0.28
  return Math.max(0, 1 - Math.abs(along) * 3.2) * (0.35 + cloud(x / 7, y / 7, 95) * 0.9)
}
