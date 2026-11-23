import { describe, expect, it } from 'vitest'
import { CIRCLES, draw, drawRule, makeScene, PALETTE, toCells, type Mood } from '../plugin/hooks/inferno'
import { declaredSteps, downloadOf, factsFrom, isDub, pitSize, shortFacts, readFrames, targetOf, taskChange } from '../plugin/hooks/parse'
import { advance, isSettled, progressOf } from '../plugin/hooks/progress'
import { words } from '../plugin/hooks/words'
import type { Journey } from '../plugin/types'

const journey = (reached: number, status: Journey['status']): Journey => ({ title: 'X', reached, status, startedAt: 0, endedAt: null, did: [], facts: {} })
const none = { total: 0, done: 0 }

describe('progress down the circles', () => {
  it('gives each of the five steps its circles, and only finishing the last leads out', () => {
    const depths = [0, 1, 2, 3, 4].map(reached => [
      progressOf({ journey: journey(reached, 'running'), tasks: none, download: null, isWorking: true }).depth,
      progressOf({ journey: journey(reached, 'done'), tasks: none, download: null, isWorking: true }).depth,
    ])
    expect(depths).toEqual([[0, 1], [2, 3], [4, 5], [6, 7], [8, 8]])
    expect(progressOf({ journey: journey(4, 'done'), tasks: none, download: null, isWorking: true }).isDone).toBe(true)
    expect(progressOf({ journey: journey(3, 'done'), tasks: none, download: null, isWorking: true }).isDone).toBe(false)
  })

  it('moves part of a circle only for a real download percentage', () => {
    const at = (download: number | null, reached = 3) => progressOf({ journey: journey(reached, 'running'), tasks: none, download, isWorking: true }).depth
    expect(at(0.42)).toBeCloseTo(6.42)
    expect(at(null)).toBe(6)
    expect(at(0.42, 1)).toBe(2)
  })

  it('stays put and says so on a failure, and rests when nothing is running', () => {
    expect(progressOf({ journey: journey(2, 'failed'), tasks: none, download: null, isWorking: true })).toEqual({ depth: 4, mood: 'failed', isDone: false })
    expect(progressOf({ journey: journey(2, 'running'), tasks: none, download: null, isWorking: false }).mood).toBe('idle')
    expect(progressOf({ journey: null, tasks: none, download: null, isWorking: true })).toEqual({ depth: -1, mood: 'running', isDone: false })
  })

  it('follows the task list of any other request', () => {
    const at = (done: number, total: number) => progressOf({ journey: null, tasks: { total, done }, download: null, isWorking: true })
    expect(at(0, 4).depth).toBe(0)
    expect(at(2, 4).depth).toBe(4)
    expect(at(4, 4)).toEqual({ depth: 8, mood: 'done', isDone: true })
  })

  it('glides down, and shows the stars only once it is at the bottom', () => {
    const end = progressOf({ journey: journey(4, 'done'), tasks: none, download: null, isWorking: false })
    let now = { depth: 6, stars: 0 }
    now = advance(now, end, 0.1)
    expect(now.depth).toBeGreaterThan(6)
    expect(now.depth).toBeLessThan(6.5)
    expect(now.stars).toBe(0)
    for (let i = 0; i < 60; i++) now = advance(now, end, 0.1)
    expect(now).toEqual({ depth: 8, stars: 1 })
    expect(isSettled(now, end)).toBe(true)
    // The next request starts again from the top.
    const start = progressOf({ journey: journey(0, 'running'), tasks: none, download: null, isWorking: true })
    expect(advance(now, start, 0.1).depth).toBe(0)
  })
})

describe('what counts as progress', () => {
  it('reads the dub command, download percentages and task changes', () => {
    expect(isDub('Bash', 'audio4films run "a" "b"')).toBe(true)
    expect(isDub('Bash', 'cd x && audio4films run a b')).toBe(true)
    expect(isDub('Bash', 'audio4films probe a')).toBe(false)
    expect(isDub('Read', 'audio4films run')).toBe(false)
    expect(downloadOf([{ service: 'torbox', id: '1', name: 'a', ready: false, status: '42%' }])).toBeCloseTo(0.42)
    expect(downloadOf([{ service: 'torbox', id: '1', name: 'a', ready: true, status: 'ready' }])).toBeNull()
    expect(downloadOf([{ service: 'alldebrid', id: '1', name: 'a', ready: false, status: 'Queued' }])).toBeNull()
    expect(taskChange('TaskCreate', { subject: 's' }, { task: { id: '7', subject: 's' } })).toEqual({ id: '7', to: 'open' })
    expect(taskChange('TaskUpdate', { taskId: '7', status: 'completed' }, {})).toEqual({ id: '7', to: 'done' })
    expect(taskChange('TaskUpdate', { taskId: '7', status: 'deleted' }, {})).toEqual({ id: '7', to: 'gone' })
    expect(taskChange('Read', {}, {})).toBeUndefined()
    expect(declaredSteps({ title: 'Sort files', total: 3, done: 1 })).toEqual({ title: 'Sort files', all: { step0: 'done', step1: 'open', step2: 'open' } })
    expect(declaredSteps({ title: 'x', total: 0, done: 0 })).toBeUndefined()
    expect(targetOf('progress', { title: 'Sort files', total: 3, done: 1 }, 'es')).toBe('Sort files · 1 de 3 pasos')
  })
})

describe('the drawing', () => {
  const moods: Mood[] = ['idle', 'running', 'done', 'failed']

  it.each([[24, 44], [46, 92], [72, 128]])('paints every pixel of a %ix%i canvas from the palette, in every state', (w, h) => {
    const scene = makeScene(w, h)
    expect(scene.rings).toHaveLength(CIRCLES)
    for (const mood of moods) {
      for (const depth of [0, 3.5, 8]) {
        for (const stars of [0, 0.5, 1]) {
          const px = draw(scene, { depth, mood, t: 12.3, stars })
          expect(px).toHaveLength(w * h)
          expect(Math.max(...px)).toBeLessThan(PALETTE.length)
        }
      }
    }
  })

  it('is repeatable: the same moment draws the same picture, another moment does not', () => {
    const scene = makeScene(46, 92)
    const at = (t: number) => toCells(draw(scene, { depth: 4, mood: 'running', t, stars: 0 }), 46, 92)
    expect(at(2)).toBe(at(2))
    expect(at(2)).not.toBe(at(2.3))
  })

  it('never uses more colour pairs than a terminal Raster can paint', () => {
    const scene = makeScene(72, 128)
    const pairs = new Set<number>()
    for (const mood of moods) {
      for (let depth = 0; depth < CIRCLES; depth++) {
        const px = draw(scene, { depth, mood, t: depth, stars: depth === 8 ? 0.5 : 0 })
        for (let y = 0; y < 128; y += 2) for (let x = 0; x < 72; x++) pairs.add(px[y * 72 + x]! * 100 + px[(y + 1) * 72 + x]!)
      }
    }
    expect(pairs.size).toBeLessThanOrEqual(1024)
  })

  it('packs cells as the terminal wants them: glyph, foreground, background', () => {
    const bytes = Buffer.from(toCells(new Uint8Array([8, 11, 0, 17]), 2, 2), 'base64')
    expect(bytes).toHaveLength(2 * 12)
    expect([0, 4, 8].map(o => bytes.readUInt32LE(o))).toEqual([0x2580, PALETTE[8], PALETTE[0]])
    expect([12, 16, 20].map(o => bytes.readUInt32LE(o))).toEqual([0x2580, PALETTE[11], PALETTE[17]])
    expect(drawRule(80, 1, 1)).toHaveLength(160)
  })

  it('draws the figures lower on the canvas the further down they are', () => {
    const scene = makeScene(46, 92)
    const laurel = 22
    const topOf = (depth: number) => Math.floor(draw(scene, { depth, mood: 'idle', t: 1, stars: 0 }).indexOf(laurel) / 46)
    const tops = [0, 2, 4, 6, 8].map(topOf)
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    expect(tops[0]).toBeLessThan(tops[4]!)
  })
})

describe('what each step found', () => {
  const search = 'Night of the Living Dead (1968): 143 results after ranking, from torrentio (145).\n\n1. torrentio:1 …'
  const cache = 'torrentio:1  AD cached, RD not cached  a.mkv\ntorrentio:8  AD not cached  b.mkv\ntorrentio:9  AD cached  c.mkv\nWARNING: alldebrid: x'
  it('comes from the tools own words, and is nothing when they do not say', () => {
    expect(factsFrom('search_streams', { title: 'x', year: 1968 }, search)).toEqual({ results: 143, year: 1968 })
    expect(factsFrom('search_streams', {}, 'x: 1 result after ranking')).toEqual({ results: 1 })
    expect(factsFrom('check_cache', {}, cache)).toEqual({ checked: 3, cached: 2, where: 'AllDebrid' })
    expect(factsFrom('check_cache', {}, 'a  cache unknown  x.mkv')).toEqual({ checked: 1, cached: 0 })
    expect(factsFrom('add_to_debrid', {}, 'Added to alldebrid (transfer 5): a.mkv. Ready to play.')).toEqual({ where: 'AllDebrid', percent: 100 })
    expect(factsFrom('add_to_debrid', {}, 'Added to alldebrid (transfer 5): a.mkv. Status: Queued.')).toEqual({ where: 'AllDebrid' })
    expect(factsFrom('debrid_status', {}, 'torbox 9  Downloading 42%  a.mkv')).toEqual({ where: 'TorBox', percent: 42 })
    expect(factsFrom('get_links', {}, 'a.mkv · 5.5 GB · via realdebrid\nhttps://x')).toEqual({ where: 'Real-Debrid', percent: 100 })
    expect(factsFrom('play', {}, 'Playing a.b.mkv in mpv.')).toEqual({ player: 'mpv' })
    expect(factsFrom('play', {}, 'In Stremio, open x')).toEqual({ player: 'Stremio' })
    expect(factsFrom('play', {}, 'something else')).toEqual({})
  })

  it('is short in the rock and spelled out in the legend', () => {
    const facts = { year: 1968, results: 143, cached: 2, checked: 3, where: 'AllDebrid', percent: 42 }
    expect(shortFacts(facts)).toEqual(['1968', '143', '2/3', '42%', ''])
    expect(shortFacts({ percent: 100 })[3]).toBe('OK')
    expect(words('es').found(facts, 'Example')).toEqual(['Example, 1968', '143 resultados', '2 de 3 en caché, AllDebrid', '42 % en AllDebrid', ''])
    expect(words('en').found({}, '')).toEqual(['', '', '', '', ''])
  })
})

describe('pictures from the helper', () => {
  it('reads whole lines only, and keeps the newest frame', () => {
    expect(readFrames('', 'pit /a/pit0.png 1\npit /a/pit1.png 2\npit /a/pi')).toEqual({ rest: 'pit /a/pi', frame: { file: '/a/pit1.png', generation: 2 } })
    expect(readFrames('pit /a/pi', 't2.png 3\n')).toEqual({ rest: '', frame: { file: '/a/pit2.png', generation: 3 } })
    expect(readFrames('', 'noise\n').frame).toBeUndefined()
  })

  it('fits the pane exactly, with pixels of a similar size on any screen', () => {
    expect(pitSize(46, 44, '7x18')).toEqual({ width: 322, height: 792, scale: 2 })
    expect(pitSize(46, 44, '15x36')).toEqual({ width: 690, height: 1584, scale: 4 })
    expect(pitSize(46, 44, '')).toEqual({ width: 368, height: 704, scale: 2 })
  })
})

describe('words', () => {
  it('names the nine circles in both languages', () => {
    for (const lang of ['en', 'es'] as const) expect(words(lang).circles).toHaveLength(CIRCLES)
    expect(words('es').circle(4)).toBe('Círculo V · Ira')
    expect(words('en').circle(8)).toBe('Circle IX · Treachery')
  })
})
