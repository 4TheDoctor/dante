// Draws Dante's logo: a profile in a red hood with a gold laurel wreath, facing left.
// Writes plugin/art/dante.svg, and (when @resvg/resvg-js is installed) the PNGs the mod and the
// plugin listing use. Run: node scripts/draw-logo.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const C = {
  hood: '#C7392A',
  hoodDark: '#8E2418',
  hoodLight: '#E25A3F',
  coif: '#F3E7D3',
  skin: '#E6C29A',
  skinShade: '#C99A6E',
  line: '#2A120D',
  gold: '#D4A24C',
  goldLight: '#F2CB7A',
  goldDark: '#9C7230',
  ember: '#140C0A',
}

/** Leaves along a quadratic arc, alternating sides, pointing along the arc. */
function laurel(p0, p1, p2, count, size, flip = false) {
  const out = []
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    const side = (i % 2 === 0) !== flip ? 1 : -1
    const tilt = angle + side * 38
    const s = size * (0.75 + 0.25 * Math.sin(Math.PI * t))
    const fill = i % 3 === 0 ? C.goldLight : C.gold
    const L = s * 1.35
    const W = s * 0.62
    // A pointed leaf: two curves meeting at both tips, with a midrib.
    out.push(
      `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(1)}) translate(${(L * 0.55).toFixed(1)} 0)">` +
        `<path d="M${-L} 0 Q 0 ${-W} ${L} 0 Q 0 ${W} ${-L} 0 Z" fill="${fill}" stroke="${C.goldDark}" stroke-width="1.1"/>` +
        `<path d="M${-L * 0.8} 0 L ${L * 0.8} 0" stroke="${C.goldDark}" stroke-width="0.8" opacity="0.7"/></g>`,
    )
  }
  const stem = `<path d="M${p0} Q${p1} ${p2}" fill="none" stroke="${C.goldDark}" stroke-width="2.4" stroke-linecap="round"/>`
  return stem + out.join('')
}

function figure() {
  // Coordinates on a 200 x 200 canvas. The figure faces left.
  const hood = `
    <path d="M70 62 C 70 30, 118 18, 148 34 C 172 47, 178 78, 170 108 C 166 126, 170 146, 182 168
             C 186 178, 180 192, 168 194 L 58 196 C 50 186, 56 170, 72 162 C 84 156, 90 150, 92 142 Z"
          fill="${C.hood}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M150 40 C 168 56, 170 84, 162 110 C 158 126, 160 146, 172 166"
          fill="none" stroke="${C.hoodDark}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
    <path d="M92 40 C 108 30, 128 28, 142 34" fill="none" stroke="${C.hoodLight}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`
  // The coif frames the face; the face sits inside it.
  const coif = `
    <path d="M74 56 C 86 50, 98 52, 104 62 C 110 84, 110 118, 104 146 C 98 152, 90 154, 82 152 L 74 140 Z"
          fill="${C.coif}" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>`
  const face = `
    <path d="M78 60 C 88 58, 96 62, 98 72 C 100 92, 100 118, 96 138 C 92 146, 84 148, 76 146
             C 70 140, 66 134, 64 128 C 60 126, 60 122, 63 120 C 60 116, 60 113, 63 111
             C 58 110, 54 108, 50 104 C 47 101, 49 98, 53 96 C 58 92, 62 86, 64 80 C 66 72, 70 64, 78 60 Z"
          fill="${C.skin}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M90 66 C 96 80, 96 112, 90 140" fill="none" stroke="${C.skinShade}" stroke-width="6" opacity="0.55" stroke-linecap="round"/>
    <path d="M64 86 L 81 80" fill="none" stroke="${C.line}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M67 91 Q 72 87.5 77 90.5 Q 72 93.5 67 91 Z" fill="${C.coif}" stroke="${C.line}" stroke-width="1.6"/>
    <circle cx="70.5" cy="90.6" r="1.9" fill="${C.line}"/>
    <path d="M62 102 C 64 106, 66 108, 70 108" fill="none" stroke="${C.skinShade}" stroke-width="2" stroke-linecap="round"/>
    <path d="M63 120.5 C 66 121.5, 69 122.5, 73 124" fill="none" stroke="${C.line}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M72 134 C 76 138, 82 140, 88 138" fill="none" stroke="${C.skinShade}" stroke-width="2.5" stroke-linecap="round"/>`
  const wreath = laurel([66, 70], [96, 22], [160, 50], 11, 9) + laurel([160, 50], [176, 66], [174, 90], 4, 7, true)
  return hood + coif + face + wreath
}

/** Square badge for the plugin listing: dark ember disc, gold ring, the figure inside. */
function badge() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="512" height="512">
  <defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#3A1610"/><stop offset="1" stop-color="${C.ember}"/></radialGradient>
  <clipPath id="c"><circle cx="100" cy="100" r="90"/></clipPath></defs>
  <circle cx="100" cy="100" r="96" fill="url(#g)" stroke="${C.gold}" stroke-width="6"/>
  <g clip-path="url(#c)" transform="translate(14 14) scale(0.9)">${figure()}</g>
</svg>`
}

/** Transparent header art, 5:4 like the 10 x 4 cell box the mod draws it in. */
function header() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 10 200 160" width="360" height="288">${figure()}</svg>`
}

const art = join(root, 'plugin', 'art')
mkdirSync(art, { recursive: true })
writeFileSync(join(art, 'dante.svg'), header())
writeFileSync(join(art, 'dante-badge.svg'), badge())

let Resvg
try {
  ;({ Resvg } = await import(process.env.RESVG_MODULE ?? '@resvg/resvg-js'))
} catch {
  console.log('SVGs written; install @resvg/resvg-js (or set RESVG_MODULE) to render the PNGs.')
  process.exit(0)
}
const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
writeFileSync(join(art, 'dante.png'), render(header(), 360))
mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true })
writeFileSync(join(root, 'plugin', '.claude-plugin', 'icon.png'), render(badge(), 512))
console.log('wrote plugin/art/dante.svg, dante-badge.svg, dante.png and plugin/.claude-plugin/icon.png')
