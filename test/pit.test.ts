import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PLTE, SPOT } from '../src/pit/palette.js'
import { encodePng } from '../src/pit/png.js'
import { CLEAR, Rule } from '../src/pit/rule.js'
import { Pit, type Goal } from '../src/pit/scene.js'
import * as sprites from '../src/pit/sprites.js'

const { capitals, textWidth, wrap } = sprites
import { drawsPictures } from '../src/launch.js'

const goal = (depth: number, mood: Goal['mood'] = 'running', isDone = false): Goal => ({ depth, mood, isDone })
const run = (pit: Pit, to: Goal, seconds: number): Uint8Array => {
  let px = pit.frame(to, 0.1)
  for (let i = 1; i < seconds * 10; i++) px = pit.frame(to, 0.1)
  return px
}

describe('the high-resolution pit', () => {
  it.each([[100, 220], [161, 396], [184, 352]])('paints every pixel of %ix%i from the palette', (w, h) => {
    const pit = new Pit(w, h)
    for (const to of [goal(0, 'idle'), goal(4), goal(4, 'failed'), goal(8, 'done', true)]) {
      const px = run(pit, to, 3)
      expect(px).toHaveLength(w * h)
      expect(Math.max(...px)).toBeLessThan(PLTE.length / 3)
    }
  })

  it.each([[70, 220], [100, 220], [210, 360]])('has the name lit over the gate at %ix%i, and the error in its place', (w, h) => {
    const pit = new Pit(w, h)
    const count = (px: Uint8Array, ...colors: number[]): number => px.subarray(0, w * 34).filter(one => colors.includes(one)).length
    const board = [SPOT.coif, SPOT.bone, SPOT.togaShade]
    const lit = run(pit, goal(2), 3)
    expect(count(lit, ...board)).toBeGreaterThan(300)
    expect(count(lit, SPOT.robe, SPOT.robeDark)).toBeGreaterThan(60)
    const dark = run(pit, goal(2, 'failed'), 3)
    expect(count(dark, ...board)).toBe(0)
    expect(count(dark, SPOT.amber)).toBe(0)
    pit.labels = { ...pit.labels, reason: 'It does not answer' }
    expect(count(run(pit, goal(2, 'failed'), 1), SPOT.amber)).toBeGreaterThan(20)
  })

  it('walks down to where the request is, and is settled only once there', () => {
    const pit = new Pit(161, 396)
    pit.frame(goal(3), 0.1)
    expect(pit.isSettled(goal(3))).toBe(false)
    run(pit, goal(3), 90)
    expect(pit.isSettled(goal(3))).toBe(true)
    expect(pit.isSettled(goal(5))).toBe(false)
  })

  it('shows the stars only after the whole way down, and starts over for the next request', () => {
    const pit = new Pit(161, 396)
    run(pit, goal(8, 'done', true), 1)
    expect(pit.stars).toBe(0)
    run(pit, goal(8, 'done', true), 200)
    expect(pit.stars).toBe(1)
    run(pit, goal(0), 30)
    expect(pit.stars).toBe(0)
    expect(pit.isSettled(goal(0))).toBe(true)
  })

  it('can be put on any circle at once, and only then are its icon and the ones above awake', () => {
    const pit = new Pit(161, 396)
    for (const depth of [-1, 0, 3, 6.5, 8]) {
      pit.place(depth)
      expect(pit.isSettled(goal(depth))).toBe(true)
    }
    const led = (depth: number): number => {
      pit.place(depth)
      return pit.frame(goal(depth), 0).filter(c => c === SPOT.led).length
    }
    // The radar of the third circle has lit blips only from there on.
    expect(led(4)).toBeGreaterThan(led(1) + 5)
  })

  it('stops part way down a stair for a download that is part way', () => {
    const pit = new Pit(161, 396)
    run(pit, goal(6.4), 160)
    expect(pit.isSettled(goal(6.4))).toBe(true)
    expect(pit.isSettled(goal(7))).toBe(false)
  })

  it('fills the river with the download, and lights the bolt only when something is cached', () => {
    const count = (percent: number, cached: number): [number, number] => {
      const pit = new Pit(161, 396)
      pit.labels = { circles: [], title: '', facts: [], lit: [], now: -1, percent, checked: 4, cached }
      pit.place(8)
      const px = pit.frame(goal(8), 0)
      return [px.filter(c => c === SPOT.greenDark).length, px.filter(c => c === SPOT.star).length]
    }
    const [empty] = count(0, 0)
    const [half] = count(50, 0)
    const [full] = count(100, 0)
    expect(empty).toBeLessThan(half)
    expect(half).toBeLessThan(full)
    expect(count(0, 0)[1]).toBe(0)
    expect(count(0, 2)[1]).toBeGreaterThan(0)
  })

  it('has sprites with rows of one width', () => {
    const isSprite = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(row => typeof row === 'string')
    const all = Object.values(sprites).flatMap(value => (isSprite(value) ? [value] : Array.isArray(value) ? value.filter(isSprite) : []))
    expect(all.length).toBeGreaterThan(15)
    for (const one of all) expect(new Set(one.map(row => row.length)).size).toBe(1)
  })
})

describe('what is cut in the rock', () => {
  it('has only letters the alphabet can draw, on lines that fit', () => {
    expect(capitals('La caída: ¿qué? №1')).toBe('LA CAIDA: QUE? 1')
    expect(wrap('LA NOCHE DE LOS MUERTOS VIVIENTES', 82, 2)).toEqual(['LA NOCHE DE LOS', 'MUERTOS VIVIENTES'])
    for (const text of ['ONE TWO THREE FOUR FIVE SIX', 'SUPERCALIFRAGILISTIC', 'MMMMMMMM NNNNNNN', 'A']) {
      for (const line of wrap(text, 34, 2)) expect(textWidth(line)).toBeLessThanOrEqual(34)
    }
    expect(wrap('SUPERCALIFRAGILISTIC', 34, 2)).toHaveLength(1)
    expect(wrap('SUPERCALIFRAGILISTIC', 34, 2)[0]).toMatch(/^SUPER.*\.\.$/)
    expect(wrap('ONE TWO THREE', 200, 2)).toEqual(['ONE TWO THREE'])
  })

  it('changes with the request, and no label at all is fine too', () => {
    const pit = new Pit(161, 396)
    const plain = pit.frame(goal(-1, 'idle'), 0).slice()
    pit.labels = { circles: ['Limbo'], title: 'Example', facts: ['1968'], lit: [true], now: 1 }
    expect(pit.frame(goal(-1, 'idle'), 0)).not.toEqual(plain)
  })
})

describe('before the gate', () => {
  it('waits there with nothing asked, and crosses the river to start', () => {
    const pit = new Pit(161, 396)
    run(pit, goal(-1, 'idle'), 3)
    expect(pit.isSettled(goal(-1, 'idle'))).toBe(true)
    run(pit, goal(0), 2)
    expect(pit.isSettled(goal(0))).toBe(false)
    run(pit, goal(0), 30)
    expect(pit.isSettled(goal(0))).toBe(true)
  })
})

describe('frames', () => {
  it('are PNGs of the exact size, every drawn pixel a hard square', () => {
    const png = encodePng(Uint8Array.from([1, 2, 3, 4]), 2, 2, 3, 5, 6)
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]]).toEqual([5, 6, 8, 3])
    const at = png.indexOf('IDAT')
    const raw = inflateSync(png.subarray(at + 4, at + 4 + png.readUInt32BE(at - 4)))
    expect([...raw.subarray(0, 6)]).toEqual([0, 1, 1, 1, 2, 2])
    expect([...raw.subarray(6, 12)]).toEqual([2, 0, 0, 0, 0, 0])
    expect([...raw.subarray(18, 24)]).toEqual([0, 3, 3, 3, 4, 4])
  })

  it('can start further right, so two of them side by side are one picture', () => {
    const px = Uint8Array.from([1, 2, 3, 4])
    const row = (png: Buffer): number[] => {
      const at = png.indexOf('IDAT')
      return [...inflateSync(png.subarray(at + 4, at + 4 + png.readUInt32BE(at - 4))).subarray(1, 1 + png.readUInt32BE(16))]
    }
    const whole = row(encodePng(px, 4, 1, 3, 12, 3))
    // Cut in the middle of a pixel of the drawing.
    const left = row(encodePng(px, 4, 1, 3, 5, 3))
    const right = row(encodePng(px, 4, 1, 3, 7, 3, undefined, 5))
    expect([...left, ...right]).toEqual(whole)
  })

  it('come from the helper as file paths, and it cleans up when told to stop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dante-pit-'))
    const run = join(dir, 'run')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(run)
    const state = join(run, 'state.json')
    writeFileSync(state, JSON.stringify({ depth: 2, mood: 'running', isDone: false, pace: 'full', heat: 1, pit: { width: 200, height: 400, scale: 2 }, rule: { width: 300, height: 18, scale: 2, parts: [211, 89] } }))
    const child = spawn(process.execPath, ['dist/pit/daemon.js', state, join(run, 'frames')], { stdio: ['ignore', 'pipe', 'inherit'] })
    const files = await new Promise<Record<string, string>>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`exit ${code}`)))
      const seen: Record<string, string> = {}
      child.stdout.on('data', data => {
        for (const m of String(data).matchAll(/^(pit|rule2?) (\/.+\.png) \d+ (\d+x\d+)$/gm)) seen[`${m[1]} ${m[3]}`] = m[2]!
        if (Object.keys(seen).length === 3) resolve(seen)
      })
    })
    expect(Object.keys(files).sort()).toEqual(['pit 200x400', 'rule 211x18', 'rule2 89x18'])
    for (const file of Object.values(files)) expect(readFileSync(file).subarray(1, 4).toString()).toBe('PNG')
    const ended = new Promise(resolve => child.once('exit', resolve))
    writeFileSync(state, '{"stop":true}')
    expect(await ended).toBe(0)
    expect(existsSync(run)).toBe(false)
  }, 15_000)
})

describe('a fault', () => {
  it('breaks the circle it happened in, shows why on the sign, and passes', () => {
    for (let circle = 0; circle < 9; circle++) {
      const pit = new Pit(161, 396)
      pit.labels = { circles: [], title: '', facts: [], lit: [], now: -1, reason: 'It broke' }
      pit.place(circle)
      const well = run(pit, goal(circle), 2).filter(c => c === SPOT.red).length
      const broken = run(pit, goal(circle, 'failed'), 2).slice()
      expect(pit.isSettled(goal(circle, 'failed'))).toBe(true)
      expect(Math.max(...broken)).toBeLessThan(PLTE.length / 3)
      expect(broken.filter(c => c === SPOT.red).length).toBeGreaterThan(well)
      run(pit, goal(circle), 2)
      expect(pit.isSettled(goal(circle))).toBe(true)
    }
  })
})

describe('a fault above them', () => {
  it('does not send them back to the gate', () => {
    const pit = new Pit(161, 396)
    pit.place(6.4)
    const still = run(pit, goal(5, 'failed'), 3).slice()
    expect(pit.isSettled(goal(5, 'failed'))).toBe(true)
    expect(pit.isSettled(goal(6.4))).toBe(false)
    run(pit, goal(6.4), 2)
    expect(pit.isSettled(goal(6.4))).toBe(true)
    expect(still.length).toBe(161 * 396)
  })
})

describe('the burning rule', () => {
  it('burns high, glows low, and lets the terminal through where there is no fire', () => {
    const lit = (want: number): number => {
      const rule = new Rule(200, 9)
      let px = rule.frame(want, 0.1)
      for (let i = 0; i < 80; i++) px = rule.frame(want, 0.1)
      expect(rule.isSettled(want)).toBe(true)
      expect(Math.max(...px)).toBeLessThan(PLTE.length / 3)
      return px.filter(c => c !== CLEAR).length
    }
    const [out, low, high] = [lit(0), lit(0.22), lit(1)]
    expect(out).toBe(200)
    expect(low).toBeLessThan(high)
    expect(high).toBeLessThan(200 * 9)
    expect(encodePng(new Uint8Array(4).fill(CLEAR), 2, 2, 1, 2, 2, CLEAR).indexOf('tRNS')).toBeGreaterThan(0)
  })
})

describe('the way the rule burns', () => {
  it('hangs from a straight edge at the top, with the tips of the flames below', () => {
    const rule = new Rule(400, 18)
    const rows = new Array<number>(18).fill(0)
    for (let i = 0; i < 120; i++) {
      const px = rule.frame(1, 0.1)
      if (i >= 40) for (let k = 0; k < px.length; k++) rows[Math.floor(k / 400)]! += px[k] === CLEAR ? 0 : 1
    }
    expect(rows[0]).toBe(400 * 80)
    for (let y = 1; y < 18; y++) expect(rows[y]).toBeLessThanOrEqual(rows[y - 1]!)
    expect(rows[17]).toBeLessThan(rows[0]! * 0.5)
  })
})

describe('which terminals get pictures', () => {
  it('kitty and Ghostty, unless inside tmux or over ssh, and whatever the settings force', () => {
    expect(drawsPictures('auto', { TERM_PROGRAM: 'ghostty' })).toBe(true)
    expect(drawsPictures('auto', { TERM: 'xterm-kitty' })).toBe(true)
    expect(drawsPictures('auto', { TERM_PROGRAM: 'Apple_Terminal' })).toBe(false)
    expect(drawsPictures('auto', { TERM_PROGRAM: 'ghostty', TMUX: '/tmp/x' })).toBe(false)
    expect(drawsPictures('auto', { TERM_PROGRAM: 'ghostty', SSH_CONNECTION: 'x' })).toBe(false)
    expect(drawsPictures('blocks', { TERM_PROGRAM: 'ghostty' })).toBe(false)
    expect(drawsPictures('image', {})).toBe(true)
  })
})
