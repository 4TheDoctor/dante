// The film's own logo, redrawn in pixel art for the screen of the drive-in. It comes from Stremio's
// public metadata, by IMDb id and without a key: the same service that finds titles.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { request, type Fetch } from '../http.js'
import { LOGO_COLORS } from './palette.js'

const METAHUB = 'https://images.metahub.space'
const MOST_BYTES = 6_000_000
const MOST_SIDE = 4096

export interface Picture {
  w: number
  h: number
  /** Red, green, blue and alpha of each pixel. */
  rgba: Uint8Array
}

/** A logo at the size it is shown: 0 is see-through, 1 and on are its own colours. */
export interface Logo {
  w: number
  h: number
  px: Uint8Array
  colors: readonly (readonly [number, number, number])[]
  /** Its edges are light: it needs a dark screen behind it. */
  isLight: boolean
}

/** Colour channels of each PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Read a PNG of 8 bits a channel, not interlaced: what the metadata service sends. */
export function decodePng(file: Buffer): Picture {
  if (file.length < 45 || file.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  const w = file.readUInt32BE(16)
  const h = file.readUInt32BE(20)
  const [depth, type, , , interlace] = file.subarray(24, 29)
  const channels = CHANNELS[type ?? -1]
  if (depth !== 8 || interlace !== 0 || channels === undefined) throw new Error('a PNG of another kind')
  if (w < 1 || h < 1 || w > MOST_SIDE || h > MOST_SIDE) throw new Error('a PNG of another size')
  const data: Buffer[] = []
  let palette: Buffer = Buffer.alloc(0)
  let clear: Buffer = Buffer.alloc(0)
  for (let at = 8; at + 12 <= file.length; ) {
    const length = file.readUInt32BE(at)
    const name = file.toString('latin1', at + 4, at + 8)
    const body = file.subarray(at + 8, at + 8 + length)
    if (name === 'IDAT') data.push(body)
    else if (name === 'PLTE') palette = body
    else if (name === 'tRNS') clear = body
    else if (name === 'IEND') break
    at += 12 + length
  }
  const stride = w * channels
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * h })
  if (raw.length < (stride + 1) * h) throw new Error('a PNG cut short')
  const px = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[y * stride + i - channels]! : 0
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0
      const c = i >= channels && y > 0 ? px[(y - 1) * stride + i - channels]! : 0
      let guess = 0
      if (filter === 1) guess = a
      else if (filter === 2) guess = b
      else if (filter === 3) guess = (a + b) >> 1
      else if (filter === 4) {
        const [da, db, dc] = [Math.abs(b - c), Math.abs(a - c), Math.abs(a + b - 2 * c)]
        guess = da <= db && da <= dc ? a : db <= dc ? b : c
      }
      px[y * stride + i] = raw[y * (stride + 1) + 1 + i]! + guess
    }
  }
  const rgba = new Uint8Array(w * h * 4)
  for (let n = 0; n < w * h; n++) {
    const at = n * channels
    const v = px[at]!
    if (type === 3) rgba.set([palette[v * 3] ?? 0, palette[v * 3 + 1] ?? 0, palette[v * 3 + 2] ?? 0, clear[v] ?? 255], n * 4)
    else if (channels < 3) rgba.set([v, v, v, channels === 2 ? px[at + 1]! : 255], n * 4)
    else rgba.set([v, px[at + 1]!, px[at + 2]!, channels === 4 ? px[at + 3]! : 255], n * 4)
  }
  return { w, h, rgba }
}

type Color = [number, number, number]
const apart = (a: readonly number[], b: readonly number[]): number => (a[0]! - b[0]!) ** 2 * 0.3 + (a[1]! - b[1]!) ** 2 * 0.59 + (a[2]! - b[2]!) ** 2 * 0.11

/** The few colours that tell the picture best. */
function reduce(pixels: readonly Color[], most: number): Color[] {
  // Split the widest box along its widest channel, then let each colour settle in the middle of its own.
  let boxes: Color[][] = [[...pixels]]
  const spread = (box: Color[]): { channel: number; width: number } => {
    const widths = [0, 1, 2].map(c => {
      let [low, high] = [255, 0]
      for (const p of box) {
        low = Math.min(low, p[c]!)
        high = Math.max(high, p[c]!)
      }
      return high - low
    })
    const width = Math.max(...widths)
    return { channel: widths.indexOf(width), width }
  }
  while (boxes.length < most) {
    const widest = boxes.map((box, n) => ({ n, ...spread(box) })).sort((a, b) => b.width - a.width)[0]!
    if (widest.width < 24) break
    const box = boxes[widest.n]!.sort((a, b) => a[widest.channel]! - b[widest.channel]!)
    const half = box.length >> 1
    boxes = [...boxes.filter((_, n) => n !== widest.n), box.slice(0, half), box.slice(half)]
  }
  let colors = boxes.filter(box => box.length > 0).map(box => [0, 1, 2].map(c => Math.round(box.reduce((sum, p) => sum + p[c]!, 0) / box.length)) as Color)
  for (let round = 0; round < 4; round++) {
    const sums = colors.map(() => [0, 0, 0, 0])
    for (const p of pixels) {
      const sum = sums[nearest(colors, p)]!
      for (let c = 0; c < 3; c++) sum[c]! += p[c]!
      sum[3]! += 1
    }
    colors = colors.map((color, n) => (sums[n]![3] === 0 ? color : ([0, 1, 2].map(c => Math.round(sums[n]![c]! / sums[n]![3]!)) as Color)))
  }
  return colors
}

function nearest(colors: readonly Color[], p: readonly number[]): number {
  let best = 0
  for (let n = 1; n < colors.length; n++) if (apart(colors[n]!, p) < apart(colors[best]!, p)) best = n
  return best
}

/** How bright a colour looks, 0 to 1. */
const light = ([r, g, b]: readonly number[]): number => ((r! / 255) ** 2.2 * 0.2126 + (g! / 255) ** 2.2 * 0.7152 + (b! / 255) ** 2.2 * 0.0722)
const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
/** The two screens a logo may be shown on (coif and stone in palette.ts). */
const LIT = light([243, 231, 211])
const DARK = light([43, 33, 27])
const READABLE = 2.4

/** Redraw a logo to fit `boxW` x `boxH` pixels: hard edges and few colours. */
export function pixelLogo({ w, h, rgba }: Picture, boxW: number, boxH: number): Logo | undefined {
  let [left, top, right, bottom] = [w, h, -1, -1]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3]! < 90) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  const [cw, ch] = [right - left + 1, bottom - top + 1]
  // Nothing there, or a picture with no see-through part: not a logo.
  if (cw < 8 || ch < 4) return undefined
  const scale = Math.min(boxW / cw, boxH / ch)
  const W = Math.max(1, Math.round(cw * scale))
  const H = Math.max(1, Math.round(ch * scale))
  const seen: Array<Color | undefined> = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [x0, x1] = [left + Math.floor((x * cw) / W), left + Math.max(Math.floor((x * cw) / W) + 1, Math.floor(((x + 1) * cw) / W))]
      const [y0, y1] = [top + Math.floor((y * ch) / H), top + Math.max(Math.floor((y * ch) / H) + 1, Math.floor(((y + 1) * ch) / H))]
      let [r, g, b, a, n] = [0, 0, 0, 0, 0]
      for (let j = y0; j < Math.min(y1, h); j++) {
        for (let i = x0; i < Math.min(x1, w); i++) {
          const at = (j * w + i) * 4
          const cover = rgba[at + 3]!
          r += rgba[at]! * cover
          g += rgba[at + 1]! * cover
          b += rgba[at + 2]! * cover
          a += cover
          n += 1
        }
      }
      // Thin strokes cover little of a pixel: less than half of it is enough.
      seen.push(n > 0 && a / n > 255 * 0.36 ? [r / a, g / a, b / a] : undefined)
    }
  }
  const opaque = seen.filter(color => color !== undefined)
  if (opaque.length < 12) return undefined
  const colors = reduce(opaque, LOGO_COLORS)
  const px = Uint8Array.from(seen, color => (color === undefined ? 0 : nearest(colors, color) + 1))
  // What has to stand out from the screen is the rim.
  let [onLit, onDark] = [0, 0]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const color = px[y * W + x]!
      if (color === 0) continue
      const isRim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => x + a! < 0 || y + b! < 0 || x + a! >= W || y + b! >= H || px[(y + b!) * W + x + a!] === 0)
      if (!isRim) continue
      const shade = light(colors[color - 1]!)
      if (contrast(shade, LIT) >= READABLE) onLit += 1
      if (contrast(shade, DARK) >= READABLE) onDark += 1
    }
  }
  // The bright screen, unless the dark one shows clearly more of it.
  return { w: W, h: H, px, colors, isLight: onDark > onLit * 1.15 }
}

export const isImdbId = (id: string): boolean => /^tt\d{5,10}$/.test(id)

/** A film's logo file, kept in `dir` once fetched. Undefined when there is none. */
export async function fetchLogo(id: string, dir: string | undefined, fetchImpl?: Fetch): Promise<Buffer | undefined> {
  if (!isImdbId(id)) return undefined
  const kept = dir === undefined ? undefined : join(dir, `${id}.png`)
  if (kept !== undefined) {
    try {
      return readFileSync(kept)
    } catch {
      // Not seen before.
    }
  }
  const answer = await request(`${METAHUB}/logo/medium/${id}/img`, { fetchImpl })
  if (!answer.ok || Number(answer.headers.get('content-length') ?? 0) > MOST_BYTES) return undefined
  const file = Buffer.from(await answer.arrayBuffer())
  if (file.length > MOST_BYTES) return undefined
  decodePng(file)
  if (dir !== undefined && kept !== undefined) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(`${kept}.${process.pid}.tmp`, file)
    renameSync(`${kept}.${process.pid}.tmp`, kept)
  }
  return file
}
