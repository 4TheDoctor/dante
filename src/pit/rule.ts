// The burning rule under the header: a bed of coals as wide as the terminal, with flames while
// Dante works. Pixels are palette indexes; CLEAR ones let the terminal through.
import { FLAME, SPOT } from './palette.js'
import { cloud, noise } from './scene.js'

export const CLEAR = SPOT.void

export class Rule {
  private readonly px: Uint8Array
  private warmth = 0
  private t = 0

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h).fill(CLEAR)
  }

  /** Whether it has the warmth asked for, so a cold bed can stop repainting. */
  isSettled(want: number): boolean {
    return Math.abs(this.warmth - want) < 0.02
  }

  /** `want`: 1 burns, about 0.2 glows, 0 is out. */
  frame(want: number, dt: number): Uint8Array {
    const { w, h, px } = this
    this.t += dt
    this.warmth += (want - this.warmth) * Math.min(1, dt * 1.8)
    const { t, warmth } = this
    const colors = FLAME[0]!
    px.fill(CLEAR)
    for (let x = 0; x < w; x++) {
      // Tall fires and low ones along the bed, drifting; on them, the tongues.
      const swell = cloud(x / 34 - t * 0.12, t * 0.35, 120)
      const tongue = cloud(x / 6.5 + t * 0.25, t * 1.5, 121)
      const tall = h * warmth * (0.16 + swell * 0.62 + tongue * 0.6)
      for (let up = 0; up < h; up++) {
        const left = 1 - up / Math.max(0.5, tall)
        if (left < -0.45) break
        // The flame licks: noise that rises through it, narrower the higher it gets.
        const lick = cloud(x / 4.2 + Math.sin(t * 1.3 + x * 0.05) * 0.6, up / 5.5 - t * 4.2, 122)
        const heat = left * 0.72 + (lick - 0.5) * (0.62 + (up / h) * 0.5)
        if (heat <= 0.05) continue
        const step = Math.floor(Math.min(0.999, heat * (0.28 + warmth * 0.72)) * colors.length)
        px[(h - 1 - up) * w + x] = colors[step]!
      }
      // The coals themselves never quite go out.
      const glow = cloud(x / 5, t * 0.6, 123) * 0.8 + noise(x, 1, Math.floor(t * 2 + noise(x, 2, 124))) * 0.2
      const coal = Math.max(0, Math.min(3, Math.floor(glow * 4.4 * (0.45 + Math.min(1, warmth * 2.4) * 0.55))))
      for (let up = 0; up < (h > 12 ? 2 : 1); up++) {
        const k = (h - 1 - up) * w + x
        if (px[k] === CLEAR) px[k] = up === 0 || glow > 0.55 ? colors[Math.max(0, coal - up)]! : CLEAR
      }
    }
    return px
  }
}
