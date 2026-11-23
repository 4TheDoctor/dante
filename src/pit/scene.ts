// The high-resolution Inferno: nine circles in a cut-away pit, lit by simulated fire. Each circle
// has its own punishment; Dante and Virgil walk the ledges and climb down as the request advances,
// and come out under the stars when it is done. Pixels are palette indexes (palette.ts).
import { FLAME, LEVELS, RAMP, SPOT, type RampName } from './palette.js'
import { CERBERUS, DANTE, LUCIFER, SOUL, stamp, textWidth, VIRGIL, write, type Canvas } from './sprites.js'

export type Mood = 'idle' | 'running' | 'done' | 'failed'

export interface Goal {
  /** 0 = first circle … 8 = ninth; a fraction is the way down to the next. */
  depth: number
  mood: Mood
  /** The request is finished: out to see the stars. */
  isDone: boolean
}

export const CIRCLES = 9
const LAST = CIRCLES - 1
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const WALL: readonly RampName[] = ['earth', 'blood', 'earth', 'stone', 'bog', 'fire', 'blood', 'fire', 'ice']
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
/** Hottest value of the fire simulation. */
const HOTTEST = 36
const DISTANCES = 64

/** The picture and what moves in it. One per size; `frame` moves it on and paints it. */
export class Pit {
  readonly rings: Ring[] = []
  readonly top: number
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
  t = 0
  stars = 0
  // Where Virgil is; Dante walks where he has been.
  private ring = 0
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
    this.top = Math.max(40, Math.round(h * 0.125))
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
        if (y < this.top) this.put(x, y, 'night', 0.9 - (y / this.top) * 0.9 + cloud(x / 9, y / 5, 3) * 0.7)
        else this.buildPit(x, y)
      }
    }
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
      const crack = grain.seam < 0.07 ? 1.2 : grain.seam < 0.14 ? 0.4 : 0
      this.put(x, y, WALL[i]!, 0.5 + curve * 1.5 + grain.id * 0.7 - crack - shade * 1.3, i, Math.max(0, this.back(i, dx) - y))
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

  /** The dark wood: bare trees on both sides of the gate. */
  private buildWood(): void {
    const ground = this.top - 4
    for (let x = 0; x < this.w; x++) {
      const bump = Math.round(cloud(x / 7, 1, 12) * 3)
      for (let y = ground - bump; y < this.top; y++) this.put(x, y, 'wood', 1 + noise(x, y, 13) * 1.1)
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
    const gate = 34
    const trees = Math.max(2, Math.floor((this.cx - gate) / 11))
    for (let side = -1; side <= 1; side += 2) {
      for (let n = 0; n < trees; n++) {
        const x = this.cx + side * (gate + 4 + n * 11 + noise(n, side + 2, 19) * 6)
        branch(x, ground, -Math.PI / 2 + (noise(n, side + 2, 20) - 0.5) * 0.3, ground * (0.62 + noise(n, side + 2, 21) * 0.4), 3, n * 13 + side * 5 + 40)
      }
    }
  }

  private buildGate(): void {
    const cx = Math.round(this.cx)
    const ground = this.top - 1
    const span = 13
    const height = Math.min(24, this.top - 18)
    for (let y = ground - height; y <= ground; y++) {
      for (let x = cx - span - 6; x <= cx + span + 6; x++) {
        const ax = Math.abs(x - cx)
        const arch = ground - height + 5
        const isOpen = ax < span && (y > arch + 6 || Math.hypot(ax, (y - arch - 6) * 1.6) < span)
        if (isOpen) {
          // Firelight from below comes up through the gate.
          this.put(x, y, 'fire', Math.max(0, (y - ground + 14) / 6), 0, 34)
          continue
        }
        const block = stones(x, y, 6, 0.8, 23)
        this.put(x, y, 'stone', 1.8 + block.id * 1.4 - (block.seam < 0.12 ? 1.1 : 0) - (ax > span + 4 ? 0.7 : 0), 0, 40)
      }
    }
    // The tablet with the inscription.
    const tabletTop = ground - height - 15
    for (let y = tabletTop; y < tabletTop + 16; y++) {
      for (let x = cx - 29; x <= cx + 29; x++) {
        const isEdge = y === tabletTop || y === tabletTop + 15 || Math.abs(x - cx) === 29
        this.put(x, y, 'stone', isEdge ? 3.6 : 1.9 + noise(x, y, 24) * 0.5, 0, 44)
      }
    }
  }

  /** Steps cut in the wall: right, then left, then right… from each ledge to the next. */
  private stairAlong(i: number): number {
    return i % 2 === 0 ? 0.84 : 0.16
  }

  private buildStairs(): void {
    for (let i = 0; i < LAST; i++) {
      const from = this.onLedge(i, this.stairAlong(i))
      const to = this.onLedge(i + 1, this.stairAlong(i))
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
    const wanted = Math.max(0, Math.min(LAST, goal.depth))
    const here = this.ring + this.climb
    if (wanted < here - 0.02 && (wanted < this.ring || this.climb === 0)) {
      // A new request: back to the first circle.
      this.ring = Math.floor(wanted)
      this.climb = 0
      this.along = 0.4
      this.trail = []
    }
    // The further behind, the faster.
    const haste = 1 + Math.max(0, wanted - here) * 0.9
    const length = Math.PI * this.rings[this.ring]!.outer
    const pace = (26 * haste * dt) / length
    if (wanted > here + 0.001 && this.ring < LAST) {
      const stair = this.stairAlong(this.ring)
      if (this.climb === 0 && Math.abs(this.along - stair) > 0.012) {
        this.heading = stair > this.along ? 1 : -1
        this.along += this.heading * Math.min(Math.abs(stair - this.along), pace * 1.4)
        this.walked += 26 * haste * dt
      } else {
        const most = Math.min(1, wanted - this.ring)
        this.climb = Math.min(most, this.climb + 0.75 * haste * dt)
        this.walked += 18 * dt
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
        this.along = Math.min(0.33, this.along + pace)
        this.walked += 20 * dt
      }
    } else if (goal.mood === 'running' && this.climb === 0) {
      if (this.along > 0.74) this.heading = -1
      if (this.along < 0.26) this.heading = 1
      this.along += this.heading * pace * 0.55
      this.walked += 14 * dt
    }
    const step = this.virgil()
    const last = this.trail.at(-1)
    if (last === undefined || last.x !== step.x || last.y !== step.y) this.trail.push(step)
    if (this.trail.length > 90) this.trail.shift()
  }

  private virgil(): Step {
    if (this.climb > 0 && this.ring < LAST) {
      const side = this.stairAlong(this.ring)
      const from = this.onLedge(this.ring, side)
      const to = this.onLedge(this.ring + 1, side)
      return { x: Math.round(from.x + (to.x - from.x) * this.climb), y: Math.round(from.y + (to.y - from.y) * this.climb), right: side < 0.5 }
    }
    return { ...this.onLedge(this.ring, this.along), right: this.heading > 0 }
  }

  private dante(lead: Step): Step {
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
    const ring = this.rings[this.ring]!
    const u = Math.min(1, Math.abs(dx) / ring.outer)
    return { x, y: this.climb > 0 ? lead.y : Math.round(ring.y - ring.bow * Math.sqrt(1 - u * u) * 0.72), right: lead.right }
  }

  /** How hot each circle burns: embers everywhere, a blaze where the work is. */
  private heatOf(i: number, goal: Goal): number {
    const near = Math.max(0, 1 - Math.abs(i - (this.ring + this.climb)) / 1.9)
    if (goal.mood === 'failed') return 0.55 + near * 0.45
    if (goal.mood === 'running') return 0.14 + near * 0.86
    return 0.1 + near * 0.3
  }

  private burn(dt: number, goal: Goal): void {
    const { w } = this
    for (let i = 0; i < CIRCLES; i++) {
      // Cocytus does not burn: a cold mist at most.
      const want = this.heatOf(i, goal) * (i === LAST ? 0.35 : 1)
      const warmth = (this.warmth[i]! += (want - this.warmth[i]!) * Math.min(1, dt * 2.2))
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
      const i = Math.min(LAST - 1, Math.max(0, this.ring + (this.random() < 0.6 ? 0 : Math.floor(this.random() * 4) - 1)))
      const ring = this.rings[i]!
      this.sparks.push({ x: this.cx + (this.random() - 0.5) * 2 * ring.outer * 0.9, y: ring.y - ring.bow * 0.6, vx: 0, vy: -(8 + this.random() * 22), life: 1 + this.random() * 1.6 })
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
    const there = Math.abs(this.ring + this.climb - Math.max(0, Math.min(LAST, goal.depth))) < 0.02
    return there && this.stars === (goal.isDone ? 1 : 0)
  }

  // ---- painting ---------------------------------------------------------------------------

  /** Move everything on by `dt` seconds and paint it. The same array is reused for each frame. */
  frame(goal: Goal, dt: number): Uint8Array {
    this.t += dt
    const isThere = this.ring === LAST
    this.stars = Math.max(0, Math.min(1, this.stars + (goal.isDone && isThere ? dt / 2.2 : goal.isDone ? 0 : -dt / 0.9)))
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
    this.paintGate()
    const canvas: Canvas = { w, h, px }
    this.paintFire()
    for (let i = 0; i < CIRCLES; i++) this.paintCircle(i, canvas)
    this.paintRims(goal)
    const lead = this.virgil()
    const follow = this.dante(lead)
    const isMoving = this.climb > 0 || goal.mood === 'running' || goal.depth > this.ring + this.climb + 0.01
    const pose = isMoving ? Math.floor(this.walked / 5) % 4 : 0
    const figures: Array<[readonly string[], Step]> = [[VIRGIL[pose]!, lead], [DANTE[(pose + 2) % 4]!, follow]]
    figures.sort((a, b) => a[1].y - b[1].y)
    for (const [art, at] of figures) stamp(canvas, art, at.x, at.y + 1, at.right)
    for (const spark of this.sparks) {
      const x = Math.round(spark.x)
      const y = Math.round(spark.y)
      if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = FLAME[0]![spark.life > 1.2 ? 7 : spark.life > 0.6 ? 5 : 3]!
    }
  }

  private paintGate(): void {
    const { w, h, px } = this
    const canvas: Canvas = { w, h, px }
    const cx = Math.round(this.cx)
    const height = Math.min(24, this.top - 18)
    const tabletTop = this.top - 1 - height - 15
    const ink = FLAME[0]![4 + Math.round(Math.sin(this.t * 2.2) * 0.6 + 0.6)]!
    for (const [n, line] of ['LASCIATE OGNE', 'SPERANZA'].entries()) write(canvas, line, cx - (textWidth(line) >> 1), tabletTop + 2 + n * 7, ink)
    // Three pairs of eyes in the wood: the leopard, the lion and the she-wolf.
    const ground = this.top - 10
    const eyes: Array<[number, number]> = [[0.1, ground - 4], [0.86, ground], [0.94, ground - 9]]
    eyes.forEach(([u, y], n) => {
      if (noise(n, Math.floor(this.t * 1.1 + n * 0.7), 60) < 0.22) return
      const x = Math.round(u * w)
      for (const dx of [0, 4]) if (x + dx < w) px[y * w + x + dx] = SPOT.eyeYellow
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

  /** The punishment of each circle. */
  private paintCircle(i: number, canvas: Canvas): void {
    const { t } = this
    const ring = this.rings[i]!
    const floor = (u: number): number => this.back(i, u * ring.outer) + 1
    switch (i) {
      case 0: {
        // Limbo: the noble castle, its windows lit.
        for (let n = -3; n <= 3; n++) {
          const tall = n === 0 ? 17 : Math.abs(n) === 1 ? 12 : Math.abs(n) === 2 ? 15 : 9
          const base = Math.round(floor((n * 8) / ring.outer))
          for (let x = -4; x <= 4; x++) {
            for (let y = 0; y < tall; y++) {
              if (y === tall - 1 && (x + 4) % 3 === 1) continue
              this.dot(this.cx + n * 8 + x, base - y, RAMP.stone + (x === -4 || y === tall - 1 ? 2 : x > 2 ? 0 : 1))
            }
          }
          if (noise(n + 9, Math.floor(t * 0.4), 70) < 0.8) {
            this.dot(this.cx + n * 8, base - tall + 6, SPOT.window)
            this.dot(this.cx + n * 8, base - tall + 7, SPOT.window)
          }
        }
        break
      }
      case 1:
        // Lust: the storm that never rests, and the souls it carries.
        for (let n = 0; n < 46; n++) {
          const life = (t * (0.5 + noise(n, 1, 71) * 0.5) + noise(n, 2, 71)) % 1
          const u = life * 2 - 1
          const y = ring.y - ring.tall * (0.28 + noise(n, 3, 71) * 0.6) + Math.sin(life * 9 + n) * 3
          for (let k = 0; k < 5; k++) {
            const x = this.cx + u * ring.outer - k
            if (this.isInRoom(i, x, y)) this.dot(x, y, RAMP.blood + (k < 2 ? 6 : 4))
          }
        }
        for (let n = 0; n < 4; n++) {
          const a = t * 1.2 + n * 1.7
          const x = Math.round(this.cx + Math.cos(a) * ring.outer * 0.68)
          const y = Math.round(ring.y - ring.tall * 0.52 + Math.sin(a * 1.6) * 5)
          if (this.isInRoom(i, x, y - 3)) stamp(canvas, SOUL, x, y, Math.sin(a) < 0)
        }
        break
      case 2: {
        // Gluttony: the cold rain, the mud, and Cerberus.
        stamp(canvas, CERBERUS, Math.round(this.cx + Math.sin(t * 0.35) * 14), Math.round(floor(0)) + 2, Math.cos(t * 0.35) < 0)
        for (let n = 0; n < 60; n++) {
          const life = (t * (1.6 + noise(n, 1, 72)) + noise(n, 2, 72)) % 1
          const x = this.cx + (noise(n, 3, 72) * 2 - 1) * ring.outer + life * 4
          const y = ring.y - ring.tall + life * ring.tall
          for (let k = 0; k < 3; k++) if (this.isInRoom(i, x, y - k)) this.dot(x - k * 0.4, y - k, SPOT.rain)
        }
        break
      }
      case 3:
        // Greed: two crowds push their weights at each other, and back.
        for (const side of [-1, 1]) {
          const u = side * (0.22 + 0.42 * (0.5 + 0.5 * Math.cos(t * 0.9)))
          const x = Math.round(this.cx + u * ring.outer)
          const y = Math.round(floor(u))
          for (let b = -5; b <= 5; b++) {
            for (let a = -5; a <= 5; a++) {
              const d = Math.hypot(a, b)
              if (d > 5.2) continue
              const roll = Math.sin((x / 5) * side + Math.atan2(b, a) * 3)
              this.dot(x + a, y - 5 + b, RAMP.stone + (d > 4.4 ? 1 : b < -2 ? 6 : roll > 0.5 ? 3 : 5))
            }
          }
          stamp(canvas, SOUL, x + side * 8, y + 1, side < 0)
          stamp(canvas, SOUL, x + side * 13, y + 2, side < 0)
        }
        for (let n = 0; n < 14; n++) if (noise(n, Math.floor(t * 4), 73) < 0.3) this.dot(this.cx + (noise(n, 5, 73) * 2 - 1) * ring.outer * 0.8, ring.y - 1 - noise(n, 6, 73) * ring.bow * 0.5, SPOT.coin)
        break
      case 4:
        // Wrath: the swamp of Styx, bubbling over those who fight and those who sulk.
        for (let x = Math.ceil(this.cx - ring.outer + 3); x < this.cx + ring.outer - 3; x++) {
          const dx = x - this.cx
          const back = Math.round(this.back(i, dx))
          for (let y = back; y < ring.y; y++) {
            const isInHole = (dx / ring.hole) ** 2 + ((ring.y - y) / (ring.bow * (ring.hole / ring.outer))) ** 2 <= 1
            if (isInHole) continue
            const wave = Math.sin(x * 0.35 + t * 1.6 + y * 0.9) + Math.sin(x * 0.13 - t * 0.9)
            if (wave > 1.1) this.dot(x, y, RAMP.bog + 5)
            else if (wave > 0.4) this.dot(x, y, RAMP.bog + 3)
          }
        }
        for (let n = 0; n < 5; n++) {
          const u = (noise(n, 1, 74) * 2 - 1) * 0.8
          const y = Math.round(floor(u))
          const rise = Math.sin(t * 1.3 + n * 2)
          if (rise > 0) {
            this.dot(this.cx + u * ring.outer, y, SPOT.soul)
            this.dot(this.cx + u * ring.outer + 1, y, SPOT.soulDim)
            if (rise > 0.6) this.dot(this.cx + u * ring.outer, y - 1, SPOT.soul)
          }
        }
        break
      case 5:
        // Heresy: open tombs, each with its fire.
        for (let n = -3; n <= 3; n++) {
          const u = (n / 3) * 0.78
          const x = Math.round(this.cx + u * ring.outer)
          const y = Math.round(floor(u))
          for (let a = -4; a <= 4; a++) {
            for (let b = 0; b < 5; b++) this.dot(x + a, y - b, RAMP.stone + (b === 4 ? 5 : Math.abs(a) === 4 ? 1 : 3))
            this.dot(x + a, y - 4, Math.abs(a) < 4 ? FLAME[0]![7]! : RAMP.stone + 5)
          }
          for (let k = 0; k < 7; k++) {
            const sway = Math.sin(t * 7 + n * 2 + k * 0.7)
            const half = Math.max(0, 3 - k * 0.5)
            for (let a = -Math.round(half); a <= Math.round(half); a++) this.dot(x + a + sway * k * 0.18, y - 5 - k, FLAME[0]![Math.max(2, 8 - k)]!)
          }
        }
        break
      case 6:
        // Violence: the boiling river of blood, and fire that falls like snow.
        for (let x = Math.ceil(this.cx - ring.outer + 2); x < this.cx + ring.outer - 2; x++) {
          const back = Math.round(this.back(i, x - this.cx))
          for (let y = back; y < back + 4; y++) {
            const wave = Math.sin(x * 0.5 + t * 3 + y) + Math.sin(x * 0.21 - t * 2.1)
            this.dot(x, y, wave > 0.9 ? SPOT.bloodLight : wave > -0.4 ? SPOT.blood : RAMP.blood + 2)
          }
        }
        for (let n = 0; n < 22; n++) {
          const life = (t * (0.28 + noise(n, 1, 76) * 0.2) + noise(n, 2, 76)) % 1
          const x = this.cx + (noise(n, 3, 76) * 2 - 1) * ring.outer * 0.9 + Math.sin(life * 8 + n) * 2
          const y = ring.y - ring.tall + life * ring.tall
          if (this.isInRoom(i, x, y)) this.dot(x, y, FLAME[0]![6]!)
        }
        break
      case 7:
        // Fraud: the bridges over the ditches, and a tongue of fire for each counsellor.
        for (let n = -1; n <= 1; n++) {
          const x = this.cx + n * ring.outer * 0.52
          const y = floor(n * 0.52)
          for (let a = -9; a <= 9; a++) {
            const arch = y - 6 + ((a * a) / 81) * 5
            for (let b = 0; b < 3; b++) this.dot(x + a, arch + b, RAMP.stone + (b === 0 ? 4 : 2))
          }
        }
        for (let n = 0; n < 7; n++) {
          const u = ((n / 6) * 2 - 1) * 0.82 + Math.sin(t * 0.7 + n) * 0.04
          const y = floor(u) - 1
          for (let k = 0; k < 5; k++) this.dot(this.cx + u * ring.outer + Math.sin(t * 8 + n + k) * 0.6, y - k, FLAME[0]![8 - k]!)
        }
        break
      default: {
        // Treachery: Cocytus, the lake of ice, and Lucifer beating his wings in the middle.
        stamp(canvas, LUCIFER[Math.floor(t * 1.4) % 2]!, Math.round(this.cx + 7), Math.round(ring.y - ring.bow * 0.62))
        for (let n = 0; n < 26; n++) {
          const life = (t * (0.14 + noise(n, 1, 78) * 0.12) + noise(n, 2, 78)) % 1
          const x = this.cx + (noise(n, 3, 78) * 2 - 1) * ring.outer * 0.95 + Math.sin(life * 7 + n) * 3
          const y = ring.y - ring.tall + life * ring.tall
          if (this.isInRoom(i, x, y)) this.dot(x, y, noise(n, 4, 78) < 0.4 ? SPOT.snow : RAMP.ice + 5)
        }
      }
    }
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

  private paintSky(): Uint8Array {
    const { w, h } = this
    const sky = new Uint8Array(w * h)
    const sea = Math.round(h * 0.72)
    const shore = Math.round(h * 0.87)
    const peakX = w * 0.64
    const peakY = h * 0.3
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x
        const d = bayer(x, y) / 16
        if (y < sea) {
          const v = y / sea
          // Night, then the first light of Easter morning, dithered into each other.
          const dawn = (v - 0.6) / 0.4
          sky[k] =
            dawn * 1.7 > d + 0.15
              ? RAMP.dawn + Math.min(6, Math.max(0, Math.floor(dawn * 6.6 + d - 0.7)))
              : RAMP.night + Math.min(5, Math.floor(0.6 + v * 5 + milky(x, y, w, h) * 1.8 + d))
        } else if (y < shore) {
          const v = (y - sea) / (shore - sea)
          sky[k] = RAMP.sea + Math.max(0, Math.min(6, Math.floor(4.6 - v * 4 + cloud(x / 12, y / 1.6, 80) * 1.4 + d - 0.5)))
        } else {
          const grain = stones(x, y, 8, 0.6, 81)
          sky[k] = RAMP.rock + Math.min(6, Math.floor(1 + grain.id * 1.6 - (grain.seam < 0.1 ? 0.8 : 0) + d * 0.6))
        }
        // The mountain of Purgatory: seven terraces, and the garden on top.
        const dx = x - peakX
        const reach = ((y - peakY) / (sea + 5 - peakY)) * 7
        const garden = Math.min(Math.hypot(dx, (y - peakY + 3) * 1.1), Math.hypot(dx + 7, y - peakY + 1), Math.hypot(dx - 7, y - peakY + 1))
        if (reach >= 0 && reach < 7) {
          const terrace = Math.floor(reach)
          const down = reach - terrace
          const half = 10 + terrace * w * 0.048 + down * w * 0.026
          if (Math.abs(dx) <= half) {
            const side = dx / half
            const isPath = down < 0.14
            const isRim = dx < -half + 2
            const l = isPath ? 4.6 - Math.max(0, side) * 2.4 : 2.3 - side * 1.9 - down * 0.5 + cloud(x / 4, y / 3, 82) * 1.5
            sky[k] = isRim ? RAMP.dawn + 4 : RAMP.stone + Math.max(0, Math.min(6, Math.floor(l + d - 0.5)))
          }
        } else if (reach < 0 && garden < 6.5) {
          sky[k] = RAMP.bog + Math.max(1, Math.min(6, Math.floor(4.2 - dx * 0.16 + (peakY - y) * 0.12 + noise(x >> 1, y >> 1, 83) * 1.4 + d - 0.5)))
        }
      }
    }
    return sky
  }

  private paintStars(): Uint8Array {
    const { w, h, t } = this
    const px = this.skyPx
    px.set(this.sky)
    const sea = Math.round(h * 0.72)
    const isSky = (k: number): boolean => px[k]! >= RAMP.night && px[k]! < RAMP.night + LEVELS
    const set = (x: number, y: number, color: number): void => {
      if (x < 0 || x >= w || y < 0 || y >= sea) return
      const k = y * w + x
      if (isSky(k)) px[k] = color
    }
    const count = Math.round((w * sea) / 120)
    for (let n = 0; n < count; n++) {
      const x = Math.floor(noise(n, 1, 90) * w)
      const y = Math.floor(noise(n, 2, 90) * sea * 0.76)
      if (n % 3 === 0 && milky(x, y, w, h) < 0.25) continue
      const beat = Math.sin(t * (0.6 + noise(n, 3, 90) * 1.8) + n * 2.1)
      set(x, y, beat > 0.2 ? (n % 7 === 0 ? SPOT.starWarm : SPOT.star) : SPOT.starDim)
    }
    // The four stars Dante sees first.
    const four: Array<[number, number]> = [[0.2, 0.17], [0.34, 0.1], [0.3, 0.29], [0.44, 0.21]]
    four.forEach(([u, v], n) => {
      const x = Math.round(u * w)
      const y = Math.round(v * h)
      const reach = 2 + Math.round(1.5 + 1.5 * Math.sin(t * 1.4 + n * 1.3))
      for (let k = 1; k <= reach; k++) {
        const color = k < reach - 1 ? SPOT.star : SPOT.starDim
        set(x + k, y, color)
        set(x - k, y, color)
        set(x, y + k, color)
        set(x, y - k, color)
      }
      for (const [a, b] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) set(x + a, y + b, SPOT.star)
    })
    // Light on the sea.
    const shore = Math.round(h * 0.87)
    for (let n = 0; n < 40; n++) {
      const y = sea + 2 + Math.floor(noise(n, 4, 91) * (shore - sea - 4))
      const x = Math.floor(noise(n, 5, 91) * w + Math.sin(t * 0.8 + n) * 3)
      if (Math.sin(t * 1.7 + n * 1.9) < 0.2) continue
      for (let k = 0; k < 3 + (n % 4); k++) if (x + k >= 0 && x + k < w) px[y * w + x + k] = y < sea + 14 ? RAMP.dawn + 5 : RAMP.sea + 6
    }
    const canvas: Canvas = { w, h, px }
    const foot = shore + 10
    stamp(canvas, DANTE[0]!, Math.round(w * 0.24), foot, true)
    stamp(canvas, VIRGIL[0]!, Math.round(w * 0.24) + 15, foot - 2, true)
    return px
  }
}

/** The Milky Way: a soft band across the sky. */
function milky(x: number, y: number, w: number, h: number): number {
  const along = x / w - y / (h * 0.75) + 0.28
  return Math.max(0, 1 - Math.abs(along) * 3.2) * (0.35 + cloud(x / 7, y / 7, 95) * 0.9)
}
