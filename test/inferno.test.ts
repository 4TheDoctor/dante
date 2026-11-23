import { describe, expect, it } from 'vitest'
import { CIRCLES, draw, drawRule, makeScene, PALETTE, toCells, type Mood } from '../plugin/hooks/inferno'
import { declaredSteps, downloadOf, enginesThatFailed, factsFrom, faultAt, isBroken, isDub, isRefusal, parseTransfers, pitSize, readFrames, reasonOf, ruleParts, ruleSize, shortFacts, targetOf, taskChange } from '../plugin/hooks/parse'
import { advance, factsAt, isSettled, progressOf, REHEARSAL, stopOf } from '../plugin/hooks/progress'
import { words } from '../plugin/hooks/words'
import type { Journey } from '../plugin/types'

const journey = (reached: number, status: Journey['status']): Journey => ({ title: 'X', reached, status, startedAt: 0, endedAt: null, did: [], facts: {}, reason: '', fault: null, transfer: null })
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
    for (let i = 0; i < 90; i++) now = advance(now, end, 0.1)
    expect(now).toEqual({ depth: 8, stars: 1 })
    expect(isSettled(now, end)).toBe(true)
    // The next request starts again from the top.
    const start = progressOf({ journey: journey(0, 'running'), tasks: none, download: null, isWorking: true })
    expect(advance(now, start, 0.1).depth).toBe(0)
  })
})

describe('the rehearsal', () => {
  it('goes down every circle once, from the gate to the stars', () => {
    const depths = REHEARSAL.map(scene => scene.depth)
    expect(depths[0]).toBe(-1)
    expect([...depths].sort((a, b) => a - b)).toEqual(depths)
    for (let circle = 1; circle <= CIRCLES; circle++) expect(REHEARSAL[stopOf(circle)]!.depth).toBe(circle - 1)
    expect(REHEARSAL.at(-1)!.isDone).toBe(true)
    expect(REHEARSAL.map(scene => scene.did)).toEqual([...REHEARSAL.map(scene => scene.did)].sort((a, b) => a - b))
  })

  it('runs the download from nothing to all of it, and no other number moves', () => {
    const download = REHEARSAL.find(scene => scene.isDownload)!
    expect(factsAt(download, 0).percent).toBe(0)
    expect(factsAt(download, download.seconds).percent).toBe(100)
    const still = REHEARSAL[4]!
    expect(factsAt(still, 0)).toEqual(factsAt(still, 9))
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
    const rule = Buffer.from(drawRule(80, 1, 1), 'base64')
    expect(rule).toHaveLength(80 * 12)
    for (let x = 0; x < 80; x++) expect([0x2594, 0x2580, 0x2588]).toContain(rule.readUInt32LE(x * 12))
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

describe('where it stopped', () => {
  it('breaks the circle the failure belongs to', () => {
    expect(faultAt('find_title', 'No title found for "x"', true)).toBe(0)
    expect(faultAt('search_streams', 'Error: torrentio: HTTP 500', false)).toBe(1)
    expect(faultAt('search_streams', 'X: 0 results after ranking, from no engine.\nEngines that failed: jackett: fetch failed', true)).toBe(2)
    expect(reasonOf(enginesThatFailed('X: 0 results after ranking, from no engine.\nEngines that failed: jackett: fetch failed\nNothing matched.'))).toBe('jackett: fetch failed')
    expect(enginesThatFailed('X: 0 results after ranking, from torrentio (0).')).toBe('')
    expect(faultAt('search_streams', 'X: 0 results after ranking, from torrentio (0).\nNothing matched.', true)).toBe(3)
    expect(faultAt('check_cache', 'Error: AllDebrid: timed out', false)).toBe(4)
    expect(faultAt('check_cache', 'Error: AllDebrid: The auth apikey is invalid', false)).toBe(5)
    expect(faultAt('add_to_debrid', 'Error: Real-Debrid: the account is not premium', false)).toBe(5)
    expect(faultAt('add_to_debrid', 'Error: AllDebrid: too many magnets', false)).toBe(6)
    expect(faultAt('get_links', 'Error: no playable file in X', false)).toBe(7)
    expect(faultAt('play', 'Error: mpv not found', false)).toBe(8)
  })

  it('tells a download that will not finish from one that has not finished yet', () => {
    const rows = parseTransfers('debrid_status', 'alldebrid 1  Downloading 42%  A\nalldebrid 2  No peer after 30 minutes 0%  B\nrealdebrid 3  magnet_error  C\nalldebrid 4  ready  Dead Ringers')
    expect(rows.map(isBroken)).toEqual([false, true, true, false])
    expect(rows[0]!.status).toBe('42%')
    expect(rows[1]!.status).toBe('No peer after 30 minutes')
    expect(downloadOf(rows.slice(0, 1))).toBe(0.42)
  })

  it('does not take a person saying no for a fault', () => {
    expect(isRefusal("The user doesn't want to proceed with this tool use. The tool use was rejected")).toBe(true)
    expect(isRefusal('Error: AllDebrid: HTTP 403')).toBe(false)
  })
})

describe('why it stopped', () => {
  it('is the tool own first line, without addresses, keys or paths', () => {
    expect(reasonOf('Error: AllDebrid: AUTH_BAD_APIKEY: The auth apikey is invalid')).toBe('AllDebrid: AUTH_BAD_APIKEY: The auth apikey is invalid')
    expect(reasonOf('\nError: https://x.example/CONFIGWITHKEY123/stream: timed out')).toBe('… timed out')
    expect(reasonOf('Error: bad token Zx81kq77ab09cd21ef in /Users/someone/Dante/dante.toml')).toBe('bad token … in …')
    expect(reasonOf('a'.repeat(300)).length).toBeLessThanOrEqual(100)
    expect(reasonOf('')).toBe('')
  })
})

describe('pictures from the helper', () => {
  it('reads whole lines only, and keeps the newest frame', () => {
    const heard = readFrames('', 'pit /a/pit0.png 1 322x792\nrule /a/rule0.png 1 1190x18\npit /a/pit1.png 2 322x792\npit /a/pi')
    expect(heard).toEqual({
      rest: 'pit /a/pi',
      pit: { kind: 'pit', file: '/a/pit1.png', generation: 2, width: 322, height: 792 },
      rule: { kind: 'rule', file: '/a/rule0.png', generation: 1, width: 1190, height: 18 },
    })
    expect(readFrames('pit /a/pi', 't2.png 3 4x5\n').pit?.file).toBe('/a/pit2.png')
    expect(readFrames('', 'noise\n')).toEqual({ rest: '' })
  })

  it('cuts the rule in pictures no wider than the 255 columns one may take', () => {
    expect(ruleParts(80)).toEqual([80])
    expect(ruleParts(255)).toEqual([255])
    expect(ruleParts(256)).toEqual([255, 1])
    expect(ruleParts(300)).toEqual([255, 45])
    // As wide as it gets: two of them.
    expect(ruleParts(9999)).toEqual([255, 255])
    expect(ruleParts(0)).toEqual([1])
    const heard = readFrames('', 'rule /a/rule0.png 7 1785x18\nrule2 /a/rule20.png 7 315x18\n')
    expect(heard.rule?.width).toBe(1785)
    expect(heard.rule2).toEqual({ kind: 'rule2', file: '/a/rule20.png', generation: 7, width: 315, height: 18 })
  })

  it('fits the pane exactly, with pixels of a similar size on any screen', () => {
    expect(ruleSize(190, '7x18')).toEqual({ width: 1330, height: 18, scale: 1 })
    expect(ruleSize(190, '15x36')).toEqual({ width: 2850, height: 36, scale: 2 })
    expect(pitSize(46, 44, '7x18')).toEqual({ width: 322, height: 792, scale: 2 })
    expect(pitSize(46, 44, '15x36')).toEqual({ width: 690, height: 1584, scale: 4 })
    expect(pitSize(46, 44, '')).toEqual({ width: 368, height: 704, scale: 2 })
  })
})

describe('words', () => {
  it('names the nine circles in both languages', () => {
    for (const lang of ['en', 'es'] as const) expect(words(lang).circles).toHaveLength(CIRCLES)
    expect(words('es').circle(4)).toBe('Círculo V · Caché')
    expect(words('en').circle(8)).toBe('Circle IX · Player')
  })
})
