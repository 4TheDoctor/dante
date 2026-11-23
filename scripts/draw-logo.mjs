// Draws Dante's pixel-art portrait: red hood, gold laurel, stern. No dependencies.
// Writes plugin/art/dante.png (the header picture) and plugin/.claude-plugin/icon.png (the plugin
// listing icon). Run: node scripts/draw-logo.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** One letter per pixel. K outline, R/r/H hood, S/s skin, W/w coif, G/g/L/l laurel, P eye light. */
const PALETTE = {
  K: '#1A0E0B', R: '#D03A2A', r: '#8E2418', H: '#EF6A4A', S: '#E8BE90', s: '#C08A5E',
  W: '#F3E7D3', w: '#CDBFA6', G: '#F0C35A', g: '#A87B2E', L: '#8FB65A', l: '#5E7F35', P: '#FFFFFF',
}

const PORTRAIT = [
  '......................',
  '.......KKKKKKKK.......',
  '.....KKRRRRRRRRKK.....',
  '....KRRHHRRRRRRRRK....',
  '...KRRHRRRRRRRRRRRK...',
  '..KLRRRRRRRRRRRRRRLK..',
  '.KLlGRRRRRRRRRRRRGlLK.',
  '.KGlGGlGRRRRRRGlGGlGK.',
  'KRKGGlGGlGGGGlGGlGGKRK',
  'KRRKKGGlGGllGGlGGKKRRK',
  'KRRKWWKKKKKKKKKKWWKRRK',
  'KRRKWSSSSSSSSSSSSWKRRK',
  'KRrKWSKKKSSSSKKKSWKrRK',
  'KRrKWSSKKSSSSKKSSWKrRK',
  'KRrKWSSPKSSSSPKSSWKrRK',
  'KRrKWSSSSSssSSSSSWKrRK',
  'KRrKWSSSSSsSSSSSSWKrRK',
  'KRrKWsSSSSssSSSSsWKrRK',
  'KRrrKwSSKKKKKKSSwKrrRK',
  '.KRrrKwsKSSSSKswKrrRK.',
  '.KRRrrKKwssssswKKrrRK.',
  'KRRRRrrrKKKKKKrrrRRRRK',
  'RRRHRRRrrrrrrrrrRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRR',
]

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** Paint the portrait enlarged by `scale` into a canvas of `width` x `height`, centred. */
function paint(width, height, scale, background) {
  const buf = Buffer.alloc(width * height * 4)
  if (background) background(buf, width, height)
  const w = PORTRAIT[0].length * scale
  const h = PORTRAIT.length * scale
  const ox = Math.floor((width - w) / 2)
  const oy = Math.floor((height - h) / 2)
  PORTRAIT.forEach((row, y) => {
    ;[...row].forEach((letter, x) => {
      const color = PALETTE[letter]
      if (!color) return
      const [r, g, b] = rgb(color)
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) buf.set([r, g, b, 255], ((oy + y * scale + j) * width + ox + x * scale + i) * 4)
      }
    })
  })
  return { width, height, buf }
}

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
function png({ width, height, buf }) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) buf.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Dark ember disc with a gold ring, for the listing icon. */
function badge(buf, width, height) {
  const c = width / 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
      if (d > c - 4) continue
      const [r, g, b] = d > c - 16 ? [212, 162, 76] : [26, 14, 11]
      buf.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
}

// The header slot is 10 x 4 cells, about 70 x 72 px; the picture is made at twice that (140 x 144)
// so each art pixel lands on whole screen pixels.
mkdirSync(join(root, 'plugin', 'art'), { recursive: true })
mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true })
writeFileSync(join(root, 'plugin', 'art', 'dante.png'), png(paint(140, 144, 6)))
writeFileSync(join(root, 'plugin', '.claude-plugin', 'icon.png'), png(paint(512, 512, 15, badge)))
console.log('wrote plugin/art/dante.png and plugin/.claude-plugin/icon.png')
