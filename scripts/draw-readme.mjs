// Draws the pictures of the README (.github/assets/) with Dante's own renderer. No dependencies, and
// no chance in it: the same code gives the same files. Run: npm run build && node scripts/draw-readme.mjs
// [--only hero,descent,steps,circles,rule,social] [--lang en,es]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from '../dist/pit/logo.js'
import { PLTE, RAMP, SPOT } from '../dist/pit/palette.js'
import { encodePng } from '../dist/pit/png.js'
import { CLEAR, Rule } from '../dist/pit/rule.js'
import { cloud, Pit } from '../dist/pit/scene.js'
import { writeBig } from '../dist/pit/sprites.js'
import { TONES, wordmark } from '../dist/pit/wordmark.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.github', 'assets')
mkdirSync(out, { recursive: true })
const option = (name, all) => {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? all : (process.argv[at + 1] ?? '').split(',')
}
const only = option('only', ['hero', 'descent', 'steps', 'circles', 'rule', 'social'])
const langs = option('lang', ['en', 'es'])

// The cover inks its own colours into the palette; the other pictures get it as it came.
const blank = PLTE.slice()
const fresh = () => PLTE.set(blank)

const save = (name, bytes) => {
  writeFileSync(join(out, name), bytes)
  process.stdout.write(`${name}  ${(bytes.length / 1024).toFixed(0)} KB\n`)
}

// ---------------------------------------------------------------- an animated GIF

/** LZW as GIF wants it, 8 bits a pixel. */
function lzw(pixels) {
  const bytes = []
  let acc = 0
  let bits = 0
  const push = (code, size) => {
    acc |= code << bits
    bits += size
    while (bits >= 8) {
      bytes.push(acc & 255)
      acc >>>= 8
      bits -= 8
    }
  }
  const CLEAR_CODE = 256
  let table = new Map()
  let next = 258
  let size = 9
  push(CLEAR_CODE, size)
  let prefix = pixels[0]
  for (let n = 1; n < pixels.length; n++) {
    const key = prefix * 256 + pixels[n]
    const found = table.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    push(prefix, size)
    if (next < 4096) {
      table.set(key, next)
      if (next === 1 << size && size < 12) size += 1
      next += 1
    } else {
      push(CLEAR_CODE, size)
      table = new Map()
      next = 258
      size = 9
    }
    prefix = pixels[n]
  }
  push(prefix, size)
  push(257, size)
  if (bits > 0) bytes.push(acc & 255)
  const parts = [Buffer.from([8])]
  for (let at = 0; at < bytes.length; at += 255) {
    const part = bytes.slice(at, at + 255)
    parts.push(Buffer.from([part.length, ...part]))
  }
  parts.push(Buffer.from([0]))
  return Buffer.concat(parts)
}

/**
 * An endless GIF of indexed frames `{ px, ms }`, each pixel a hard square of `scale`. Only what
 * changed since the frame before is stored. With `clear`, pixels of that colour are see-through and
 * every frame starts from nothing.
 */
function encodeGif(frames, w, h, scale, palette, clear) {
  const W = w * scale
  const H = h * scale
  const SAME = 255
  const u16 = n => [n & 255, n >> 8]
  const colors = Buffer.alloc(768)
  colors.set(palette.subarray(0, 765))
  const parts = [
    Buffer.from('GIF89a', 'latin1'),
    Buffer.from([...u16(W), ...u16(H), 0xf7, SAME, 0]),
    colors,
    Buffer.from([0x21, 0xff, 11]),
    Buffer.from('NETSCAPE2.0', 'latin1'),
    Buffer.from([3, 1, 0, 0, 0]),
  ]
  let before
  for (const { px, ms } of frames) {
    let [left, top, right, bottom] = [0, 0, w - 1, h - 1]
    if (before !== undefined && clear === undefined) {
      ;[left, top, right, bottom] = [w, h, -1, -1]
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[y * w + x] === before[y * w + x]) continue
          left = Math.min(left, x)
          right = Math.max(right, x)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
      }
      if (right < 0) [left, top, right, bottom] = [0, 0, 0, 0]
    }
    const cw = right - left + 1
    const ch = bottom - top + 1
    const big = new Uint8Array(cw * scale * ch * scale)
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const k = (top + y) * w + left + x
        const isSame = clear === undefined ? before !== undefined && px[k] === before[k] : px[k] === clear
        const color = isSame ? SAME : px[k]
        for (let b = 0; b < scale; b++) big.fill(color, (y * scale + b) * cw * scale + x * scale, (y * scale + b) * cw * scale + (x + 1) * scale)
      }
    }
    const hasClear = before !== undefined || clear !== undefined
    parts.push(
      Buffer.from([0x21, 0xf9, 4, ((clear === undefined ? 1 : 2) << 2) | (hasClear ? 1 : 0), ...u16(Math.round(ms / 10)), SAME, 0]),
      Buffer.from([0x2c, ...u16(left * scale), ...u16(top * scale), ...u16(cw * scale), ...u16(ch * scale), 0]),
      lzw(big),
    )
    before = px.slice()
  }
  parts.push(Buffer.from([0x3b]))
  return Buffer.concat(parts)
}

// ---------------------------------------------------------------- the name, cut in Roman capitals

/** The name as a picture, `w` x `h`: what the screen of the drive-in shows. */
function namePicture(w, h) {
  const { px } = wordmark(w, h)
  const rgba = new Uint8Array(w * h * 4)
  px.forEach((tone, k) => tone > 0 && rgba.set([0, 2, 4].map(at => parseInt(TONES[tone].slice(at, at + 2), 16)).concat(255), k * 4))
  return { w, h, rgba }
}

// ---------------------------------------------------------------- the drive-in

/** The end of the way, wide enough for a cover: the same scene with a bigger screen. */
class Cover extends Pit {
  screen() {
    return { x: Math.round(this.w * 0.29), y: Math.round(this.h * 0.095), w: Math.round(this.w * 0.665), h: Math.round(this.h * 0.52) }
  }
}

function cover(w, h) {
  const scene = new Cover(w, h)
  const s = scene.screen()
  scene.labels = { circles: [], title: 'DANTE', caption: 'DEBRID AGGREGATOR & NAVIGATOR TRACKER ENGINE', facts: [], lit: [], now: -1 }
  scene.show(namePicture(s.w - 14, s.h - 23))
  scene.place(8)
  const goal = { depth: 8, mood: 'done', isDone: true }
  // Down to the stars, unseen.
  while (scene.stars < 1) scene.frame(goal, 0.2)
  return { scene, goal }
}

const CALM = 0.55

if (only.includes('hero')) {
  fresh()
  const [w, h, scale] = [320, 164, 4]
  const { scene, goal } = cover(w, h)
  const frames = []
  // The last count of the leader, the name burning in, the light that runs over it, and a while to read.
  scene.t = 24 / 1.5 + 1.34
  for (let n = 0; n < 92; n++) frames.push({ px: scene.frame(goal, 0.1 / CALM).slice(), ms: 100 })
  save('hero.gif', encodeGif(frames, w, h, scale, PLTE))
  save('hero.png', encodePng(frames[70].px, w, h, scale))
}

if (only.includes('social')) {
  fresh()
  const [w, h] = [320, 160]
  const { scene, goal } = cover(w, h)
  scene.t = 24 / 1.5 + 8
  save('social-preview.png', encodePng(scene.frame(goal, 0.1), w, h, 4))
}

// ---------------------------------------------------------------- the burning rule

if (only.includes('rule')) {
  fresh()
  const [w, h, scale] = [320, 9, 4]
  const rule = new Rule(w, h)
  for (let n = 0; n < 60; n++) rule.frame(1, 0.1)
  const frames = []
  for (let n = 0; n < 40; n++) frames.push({ px: rule.frame(1, 0.1).slice(), ms: 100 })
  save('rule.gif', encodeGif(frames, w, h, scale, PLTE, CLEAR))
  save('rule.png', encodePng(frames[0].px, w, h, scale, w * scale, h * scale, CLEAR))
}

// ---------------------------------------------------------------- the way down

const WORDS = {
  en: {
    circles: ['Catalogue', 'Indexers', 'Trackers', 'Seeders', 'Cache', 'Firewall', 'Debrid', 'Links', 'Player'],
    facts: ['1968', '143 results', '2 of 3 cached', 'ready', 'mpv'],
  },
  es: {
    circles: ['Catálogo', 'Indexadores', 'Trackers', 'Semillas', 'Caché', 'Cortafuegos', 'Debrid', 'Enlaces', 'Reproductor'],
    facts: ['1968', '143 resultados', '2 de 3 en caché', 'listo', 'mpv'],
  },
}

// The stops of Dante's own rehearsal (plugin/hooks/progress.ts), with its made-up numbers and its
// film, which is in the public domain: steps done, and the one under way.
const STOPS = [
  { depth: 0, did: 0, now: 0 },
  { depth: 1, did: 1, now: -1 },
  { depth: 2, did: 1, now: 1 },
  { depth: 3, did: 2, now: -1 },
  { depth: 4, did: 2, now: 2 },
  { depth: 5, did: 3, now: -1 },
  { depth: 6, did: 3, now: 3 },
  { depth: 7, did: 4, now: -1 },
  { depth: 8, did: 4, now: 4 },
]

if (only.includes('descent')) {
  fresh()
  for (const lang of langs) {
    const [w, h, scale] = [272, 320, 2]
    // Eight times as fast as the real one.
    const [dt, ms] = [0.8, 100]
    const pit = new Pit(w, h)
    const { circles, facts } = WORDS[lang]
    const labels = (did, now, percent) => {
      pit.labels = { circles, title: 'Night of the Living Dead', facts: facts.map((fact, n) => (n < did ? fact : '')), lit: facts.map((_, n) => n < did), now, results: did > 1 ? 143 : undefined, checked: did > 2 ? 3 : undefined, cached: did > 2 ? 2 : undefined, percent }
    }
    pit.place(0)
    labels(0, 0)
    for (let n = 0; n < 40; n++) pit.frame({ depth: 0, mood: 'running', isDone: false }, 0.2)
    pit.place(0)
    const frames = []
    const shoot = goal => frames.push({ px: pit.frame(goal, dt).slice(), ms })
    for (const { depth, did, now } of STOPS) {
      const goal = { depth, mood: 'running', isDone: false }
      labels(did, now, did > 3 ? 100 : undefined)
      for (let n = 0; n < 60 && pit.ring + pit.climb < depth - 0.02; n++) shoot(goal)
      for (let n = 0; n < (now < 0 ? 2 : 6); n++) {
        if (depth === 6) labels(did, now, Math.min(100, n * 20))
        shoot(goal)
      }
    }
    labels(5, -1, 100)
    const end = { depth: 8, mood: 'done', isDone: true }
    for (let n = 0; n < 40 && pit.stars < 1; n++) shoot(end)
    for (let n = 0; n < 46; n++) frames.push({ px: pit.frame(end, 0.2).slice(), ms })
    save(`descent.${lang}.gif`, encodeGif(frames, w, h, scale, PLTE))
    const still = new Pit(w, h)
    // Three steps done, waiting for an answer: what the picture of the terminal shows.
    still.labels = { ...pit.labels, facts: facts.map((fact, n) => (n < 3 ? fact : '')), lit: facts.map((_, n) => n < 3), now: -1, percent: undefined }
    still.place(5)
    let px
    for (let n = 0; n < 70; n++) px = still.frame({ depth: 5, mood: 'running', isDone: false }, 0.2)
    save(`descent.${lang}.png`, encodePng(px, w, h, scale))
  }
}

// ---------------------------------------------------------------- six of the circles, close up

if (only.includes('circles')) {
  fresh()
  // One circle of a tall pit, without its name, while they are somewhere else in it.
  const [w, h] = [272, 430]
  const [tw, th, scale] = [96, 34, 4]
  const CIRCLES = [['catalogue', 0], ['indexers', 1], ['seeders', 3], ['cache', 4], ['links', 7], ['player', 8]]
  for (const [name, at] of CIRCLES) {
    const pit = new Pit(w, h)
    pit.labels = { circles: [], title: '', facts: [], lit: [true, true, true, true, true], now: -1, results: 143, checked: 3, cached: 2, percent: 100 }
    pit.place(at)
    let px
    for (let n = 0; n < 90; n++) px = pit.frame({ depth: at, mood: 'running', isDone: false }, 0.1)
    const ring = pit.rings[at]
    const [x0, y0] = [Math.round(w / 2 - tw / 2), Math.round(ring.y - th + 1)]
    const tile = new Uint8Array(tw * th)
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const [a, b] = [Math.min(x, tw - 1 - x), Math.min(y, th - 1 - y)]
        tile[y * tw + x] = a + b < 2 ? CLEAR : a === 0 || b === 0 || a + b === 2 ? RAMP.earth + 2 : px[(y0 + y) * w + x0 + x]
      }
    }
    save(`circle-${name}.png`, encodePng(tile, tw, th, scale, tw * scale, th * scale, CLEAR))
  }
}

// ---------------------------------------------------------------- one card for each letter

/** The acts of the header's portrait (plugin/art/dante), over coals. */
if (only.includes('steps')) {
  fresh()
  const acts = readFileSync(join(root, 'plugin', 'hooks', 'acts.ts'), 'utf8')
  const timing = act => JSON.parse(new RegExp(`^  ${act}: (\\[.*\\]),$`, 'm').exec(acts)[1])
  const [w, h, scale] = [52, 58, 4]
  const STEPS = [['D', 'title'], ['A', 'search'], ['N', 'cache'], ['T', 'add'], ['E', 'play']]
  STEPS.forEach(([letter, act], which) => {
    const palette = Buffer.from(PLTE)
    const colors = new Map()
    const extra = []
    const index = (r, g, b) => {
      const key = (r << 16) | (g << 8) | b
      if (!colors.has(key)) {
        colors.set(key, PLTE.length / 3 + extra.length / 3)
        extra.push(r, g, b)
      }
      return colors.get(key)
    }
    const dir = join(root, 'plugin', 'art', 'dante', act)
    const pictures = readdirSync(dir).filter(name => name.endsWith('.png')).sort().map(name => decodePng(readFileSync(join(dir, name))))
    const beats = timing(act).flatMap(([picture, count]) => Array(count).fill(picture))
    // Short acts go round more than once, so the coals do not jump as often.
    while (beats.length < 32) beats.push(...beats)
    const coals = new Rule(w, 9)
    for (let n = 0; n < 60 + which * 7; n++) coals.frame(0.7, 0.1)
    const frames = beats.map(at => {
      const px = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const grain = cloud(x / 7 + which * 31, y / 4, 130)
          px[y * w + x] = RAMP.rock + Math.max(0, Math.min(3, Math.floor(0.4 + grain * 1.6 + (y / h) * 0.9)))
        }
      }
      const fire = coals.frame(0.7, 0.1)
      for (let y = 0; y < 9; y++) for (let x = 0; x < w; x++) if (fire[y * w + x] !== CLEAR) px[(h - 1 - y) * w + x] = fire[y * w + x]
      const { w: W, h: H, rgba } = pictures[at]
      // Files hold pixels of 4 x 4.
      const [cols, rows] = [Math.floor(W / 4), Math.floor(H / 4)]
      const pad = Math.floor((W - cols * 4) / 2)
      const x0 = Math.round((w - cols) / 2) + 1
      const y0 = h - rows - 4
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const k = ((y * 4 + 2) * W + x * 4 + 2 + pad) * 4
          if (rgba[k + 3] > 127) px[(y0 + y) * w + x0 + x] = index(rgba[k], rgba[k + 1], rgba[k + 2])
        }
      }
      // Its letter, cut in gold as in the rock of the pit.
      const [tx, ty, side] = [Math.round(w / 2) - 8, 4, 16]
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const isEdge = x === 0 || y === 0 || x === side - 1 || y === side - 1
          px[(ty + y) * w + tx + x] = RAMP.gold + (isEdge ? 3 : 0)
        }
      }
      const tiny = { w: 5, h: 7, px: new Uint8Array(35) }
      writeBig(tiny, letter, 0, 0, 1)
      for (let y = 0; y < 14; y++) for (let x = 0; x < 10; x++) if (tiny.px[(y >> 1) * 5 + (x >> 1)] === 1) px[(ty + 1 + y) * w + tx + 3 + x] = RAMP.gold + (y < 7 ? 6 : 5)
      // A hard frame, with its corners cut.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [a, b] = [Math.min(x, w - 1 - x), Math.min(y, h - 1 - y)]
          if (a + b < 2) px[y * w + x] = CLEAR
          else if (a === 0 || b === 0 || a + b === 2) px[y * w + x] = RAMP.earth + 2
        }
      }
      return { px, ms: 100 }
    })
    save(`step-${letter.toLowerCase()}.gif`, encodeGif(frames, w, h, scale, Buffer.concat([palette, Buffer.from(extra)]), CLEAR))
  })
}

// The terminal is a page, scripts/readme-terminal.html#en and #es, captured by any browser at
// 1240 x 700, two pixels for each one, into .github/assets/terminal.<lang>.png.
