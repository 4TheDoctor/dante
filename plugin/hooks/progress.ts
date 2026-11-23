// How far down the pit the current request is. Pure. Every step down stands for something that
// really happened; nothing moves on a timer alone except the glide between two circles.
import type { Facts, Journey, TaskTally } from '../types'
import { CIRCLES, type Mood } from './inferno'
import { STEPS } from './words'

export interface Progress {
  /** -1 = before the gate; 0 = first circle … 8 = ninth. A fraction is a download's real percentage. */
  depth: number
  mood: Mood
  /** The whole thing is finished: out to see the stars. */
  isDone: boolean
}

export interface ProgressInput {
  journey: Journey | null
  tasks: TaskTally
  /** Download of what is being added, 0 to 1, when the debrid service reports it. */
  download: number | null
  isWorking: boolean
}

const LAST = CIRCLES - 1

export function progressOf({ journey, tasks, download, isWorking }: ProgressInput): Progress {
  const idle: Mood = isWorking ? 'running' : 'idle'
  if (journey !== null) {
    // Five steps, nine circles: a step waits on circle 1, 3, 5, 7 or 9, and once done stands on
    // the one below.
    const at = journey.reached * 2
    if (journey.status === 'failed') return { depth: at, mood: 'failed', isDone: false }
    if (journey.status === 'done') {
      const isDone = journey.reached === STEPS.length - 1
      return { depth: Math.min(LAST, at + 1), mood: isDone ? 'done' : idle, isDone }
    }
    const partWay = STEPS[journey.reached] === 'add' && download !== null ? Math.max(0, Math.min(1, download)) : 0
    return { depth: Math.min(LAST, at + partWay), mood: idle, isDone: false }
  }
  // Any other request with a task list: the circles share the tasks out.
  if (tasks.total > 0) {
    const isDone = tasks.done >= tasks.total
    return { depth: (LAST * Math.min(tasks.done, tasks.total)) / tasks.total, mood: isDone ? 'done' : idle, isDone }
  }
  // Nothing to measure: they wait before the gate.
  return { depth: -1, mood: idle, isDone: false }
}

export interface Motion {
  depth: number
  stars: number
}

const toward = (from: number, to: number, most: number): number => from + Math.max(-most, Math.min(most, to - from))

/** One step of the animation: glide to where the progress is, then dissolve to the stars. */
export function advance(now: Motion, to: Progress, seconds: number): Motion {
  // A new request while the stars are out starts from the top, behind the dissolve.
  const isBack = !to.isDone && now.stars > 0
  const depth = isBack ? to.depth : toward(now.depth, to.depth, (to.depth < now.depth ? 6 : 0.55) * seconds)
  const isThere = Math.abs(depth - to.depth) < 0.01
  return { depth, stars: toward(now.stars, to.isDone && isThere ? 1 : 0, seconds / (to.isDone ? 2.4 : 0.8)) }
}

/** Whether anything is still gliding, so a still picture can stop repainting. */
export const isSettled = (now: Motion, to: Progress): boolean =>
  Math.abs(now.depth - to.depth) < 0.01 && now.stars === (to.isDone ? 1 : 0)

/** One stop of the rehearsal: a made-up request, to see each circle asleep, at work and done. */
export interface Scene {
  depth: number
  seconds: number
  /** Steps done, and the one under way (-1: none). */
  did: number
  now: number
  facts: Facts
  isDone?: boolean
  /** The download runs from 0 to 100 during this stop. */
  isDownload?: boolean
}

const FOUND: Facts = { year: 1968, results: 143 }
const CHECKED: Facts = { ...FOUND, checked: 3, cached: 2, where: 'AllDebrid' }
export const REHEARSAL: readonly Scene[] = [
  { depth: -1, seconds: 4, did: 0, now: -1, facts: {} },
  { depth: 0, seconds: 21, did: 0, now: 0, facts: {} },
  { depth: 1, seconds: 19, did: 1, now: -1, facts: { year: 1968 } },
  { depth: 2, seconds: 18, did: 1, now: 1, facts: { year: 1968 } },
  { depth: 3, seconds: 17, did: 2, now: -1, facts: FOUND },
  { depth: 4, seconds: 16, did: 2, now: 2, facts: FOUND },
  { depth: 5, seconds: 15, did: 3, now: -1, facts: CHECKED },
  { depth: 6, seconds: 20, did: 3, now: 3, facts: CHECKED, isDownload: true },
  { depth: 7, seconds: 13, did: 4, now: -1, facts: { ...CHECKED, percent: 100 } },
  { depth: 8, seconds: 14, did: 4, now: 4, facts: { ...CHECKED, percent: 100 } },
  { depth: 8, seconds: 18, did: 5, now: -1, facts: { ...CHECKED, percent: 100, player: 'mpv' }, isDone: true },
]

/** The stop a circle (1 to 9) is seen at work in. */
export const stopOf = (circle: number): number => REHEARSAL.findIndex(scene => scene.depth === circle - 1)

/** A stop's numbers after that many seconds in it: only the download moves. */
export function factsAt(scene: Scene, elapsed: number): Facts {
  if (scene.isDownload !== true) return scene.facts
  return { ...scene.facts, percent: Math.min(100, Math.round((Math.max(0, elapsed - 6) / (scene.seconds - 8)) * 100)) }
}
