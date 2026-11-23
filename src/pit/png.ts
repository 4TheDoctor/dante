import { deflateSync } from 'node:zlib'
import { PLTE } from './palette.js'

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * An indexed PNG of W x H screen pixels, each pixel of the drawing a hard square of `scale`. The
 * drawing covers it whole; what sticks out at the right and bottom is cut, and the first `X` screen
 * pixels of each row are left out. Pixels of the colour `clear` are see-through.
 */
export function encodePng(px: Uint8Array, w: number, h: number, scale: number, W = w * scale, H = h * scale, clear?: number, X = 0): Buffer {
  const stride = W + 1
  const raw = Buffer.alloc(stride * H)
  for (let y = 0; y * scale < H && y < h; y++) {
    const at = y * scale * stride
    for (let x = Math.floor(X / scale); x * scale - X < W && x < w; x++) raw.fill(px[y * w + x]!, at + 1 + Math.max(0, x * scale - X), at + 1 + Math.min(W, (x + 1) * scale - X))
    // The other rows of the same pixels: "same as above", which packs to almost nothing.
    for (let k = 1; k < scale && y * scale + k < H; k++) raw[at + k * stride] = 2
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(W, 0)
  head.writeUInt32BE(H, 4)
  head.set([8, 3, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('PLTE', PLTE),
    ...(clear === undefined ? [] : [chunk('tRNS', Uint8Array.from({ length: clear + 1 }, (_, n) => (n === clear ? 0 : 255)))]),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
