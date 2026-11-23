import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACTS, type ActName } from '../plugin/hooks/acts'
import { doingOf, isStanding, next, pictureOf, STILL, type Doing, type Portrait } from '../plugin/hooks/portrait'
import { STEPS } from '../plugin/hooks/words'

const art = fileURLToPath(new URL('../plugin/art/dante/', import.meta.url))
const lengthOf = (act: ActName): number => ACTS[act].reduce((sum, [, beats]) => sum + beats, 0)
/** The acts shown over so many beats, without repeats in a row. */
const run = (from: Portrait, doing: Doing, beats: number): { last: Portrait; acts: ActName[] } => {
  let last = from
  const acts: ActName[] = [from.act]
  for (let n = 0; n < beats; n++) {
    last = next(last, doing)
    if (last.act !== acts.at(-1)) acts.push(last.act)
  }
  return { last, acts }
}

describe("Dante's portrait", () => {
  it('has a picture for every moment of every act, and no others', () => {
    expect(readdirSync(art).filter(name => !name.startsWith('.')).sort()).toEqual(Object.keys(ACTS).sort())
    for (const [name, shown] of Object.entries(ACTS)) {
      const named = [...new Set(shown.map(([picture]) => `${String(picture).padStart(2, '0')}.png`))].sort()
      expect(readdirSync(`${art}${name}`).filter(file => file.endsWith('.png')).sort()).toEqual(named)
    }
  })

  it('acts out each of the five steps, and stands on the same picture it starts from', () => {
    for (const step of STEPS) expect(run(STILL, step, 2).last.act).toBe(step)
    expect(pictureOf(STILL)).toBe('art/dante/idle/00.png')
    expect(isStanding(STILL)).toBe(true)
  })

  it('says what is going on: a running step first, then a failure, the end, thinking, rest', () => {
    const none = { calls: [], isFailed: false, isDone: false, isWorking: false }
    expect(doingOf(none)).toBe('rest')
    expect(doingOf({ ...none, isWorking: true })).toBe('think')
    expect(doingOf({ ...none, isWorking: true, isDone: true })).toBe('done')
    expect(doingOf({ ...none, isWorking: true, isFailed: true })).toBe('failed')
    expect(doingOf({ ...none, isWorking: true, isFailed: true, calls: ['title', 'search'] })).toBe('search')
  })

  it('blinks now and then, and stands the rest of the time', () => {
    let standing = 0
    let portrait = STILL
    for (let n = 0; n < 300; n++) {
      portrait = next(portrait, 'rest')
      if (isStanding(portrait)) standing += 1
    }
    expect(standing / 300).toBeGreaterThan(0.5)
    expect(standing / 300).toBeLessThan(0.7)
  })

  it('thinks one thing after another', () => {
    expect(run(STILL, 'think', lengthOf('ponder') + lengthOf('verse') + 2).acts).toEqual(['idle', 'ponder', 'verse', 'ponder'])
  })

  it('drops a thought at once for a step, but lets a step end before the next', () => {
    const thinking = run(STILL, 'think', 5).last
    expect(next(thinking, 'title').act).toBe('title')
    const reading = run(STILL, 'title', 5).last
    expect(next(reading, 'search').act).toBe('title')
    expect(run(reading, 'search', lengthOf('title')).last.act).toBe('search')
    expect(run(reading, 'rest', lengthOf('title')).last.act).toBe('idle')
  })

  it('repeats a step for as long as it runs', () => {
    expect(run(STILL, 'search', lengthOf('search') * 3).acts).toEqual(['idle', 'search'])
  })

  it('burns at once when a request breaks, once, and stays black with soot until something else goes on', () => {
    const searching = run(STILL, 'search', 5).last
    const { last, acts } = run(searching, 'failed', lengthOf('burn') + 400)
    expect(acts).toEqual(['search', 'burn', 'soot'])
    expect(next(last, 'title').act).toBe('title')
    expect(next(last, 'rest').act).toBe('idle')
  })

  it('sees the stars once when a film is served', () => {
    const playing = run(STILL, 'play', 5).last
    expect(run(playing, 'done', lengthOf('play') + lengthOf('stars') + 400).acts).toEqual(['play', 'stars', 'idle'])
  })
})
