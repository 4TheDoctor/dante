import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PLTE } from '../src/pit/palette.js'
import { encodePng } from '../src/pit/png.js'
import { Pit, type Goal } from '../src/pit/scene.js'
import { CERBERUS, DANTE, LUCIFER, SOUL, VIRGIL } from '../src/pit/sprites.js'
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

  it('walks down to where the request is, and is settled only once there', () => {
    const pit = new Pit(161, 396)
    pit.frame(goal(3), 0.1)
    expect(pit.isSettled(goal(3))).toBe(false)
    run(pit, goal(3), 30)
    expect(pit.isSettled(goal(3))).toBe(true)
    expect(pit.isSettled(goal(5))).toBe(false)
  })

  it('shows the stars only after the whole way down, and starts over for the next request', () => {
    const pit = new Pit(161, 396)
    run(pit, goal(8, 'done', true), 1)
    expect(pit.stars).toBe(0)
    run(pit, goal(8, 'done', true), 60)
    expect(pit.stars).toBe(1)
    run(pit, goal(0), 3)
    expect(pit.stars).toBe(0)
    expect(pit.isSettled(goal(0))).toBe(true)
  })

  it('stops part way down a stair for a download that is part way', () => {
    const pit = new Pit(161, 396)
    run(pit, goal(6.4), 40)
    expect(pit.isSettled(goal(6.4))).toBe(true)
    expect(pit.isSettled(goal(7))).toBe(false)
  })

  it('has sprites with rows of one width', () => {
    for (const art of [...DANTE, ...VIRGIL, SOUL, CERBERUS, ...LUCIFER]) expect(new Set(art.map(row => row.length)).size).toBe(1)
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

  it('come from the helper as file paths, and it cleans up when told to stop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dante-pit-'))
    const run = join(dir, 'run')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(run)
    const state = join(run, 'state.json')
    writeFileSync(state, JSON.stringify({ depth: 2, mood: 'running', isDone: false, pace: 'full' }))
    const child = spawn(process.execPath, ['dist/pit/daemon.js', state, join(run, 'frames'), '200', '400', '2'], { stdio: ['ignore', 'pipe', 'inherit'] })
    const file = await new Promise<string>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`exit ${code}`)))
      child.stdout.on('data', data => {
        const m = /^pit (\/.+\.png) (\d+)$/m.exec(String(data))
        if (m !== null) resolve(m[1]!)
      })
    })
    expect(readFileSync(file).subarray(1, 4).toString()).toBe('PNG')
    const ended = new Promise(resolve => child.once('exit', resolve))
    writeFileSync(state, '{"stop":true}')
    expect(await ended).toBe(0)
    expect(existsSync(run)).toBe(false)
  }, 15_000)
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
