// How far down the pit the current request is. Pure. Every step down stands for something that
// really happened; nothing moves on a timer alone except the glide between two circles.
import type { Journey, TaskTally } from '../types'
import { CIRCLES, type Mood } from './inferno'
import { STEPS } from './words'

export interface Progress {
  /** 0 = first circle … 8 = ninth. A fraction is a download's real percentage. */
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
  return { depth: 0, mood: idle, isDone: false }
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
  const depth = isBack ? to.depth : toward(now.depth, to.depth, (to.depth < now.depth ? 6 : 1.3) * seconds)
  const isThere = Math.abs(depth - to.depth) < 0.01
  return { depth, stars: toward(now.stars, to.isDone && isThere ? 1 : 0, seconds / (to.isDone ? 1.6 : 0.8)) }
}

/** Whether anything is still gliding, so a still picture can stop repainting. */
export const isSettled = (now: Motion, to: Progress): boolean =>
  Math.abs(now.depth - to.depth) < 0.01 && now.stars === (to.isDone ? 1 : 0)
