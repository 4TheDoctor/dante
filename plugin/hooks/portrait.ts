// Which picture of Dante the header shows. Pure. What he does stands for what is really going on:
// a step's act while its tool runs, thinking while Claude does, the fire when a request breaks.
import { ACTS, type ActName } from './acts'
import type { StepId } from './words'

export type Doing = 'rest' | 'think' | 'failed' | 'done' | StepId

export interface Portrait {
  /** What the act on show is for. */
  doing: Doing
  act: ActName
  /** Where in the act, and for how many more beats this picture stays. */
  at: number
  left: number
  /** How many times he has thought, so the next thought is another. */
  thoughts: number
}

const THOUGHTS: readonly ActName[] = ['ponder', 'verse']
/** He stands this many beats between two goes of these. */
const REST_BEATS = 60
const STANDING: readonly ActName[] = ['idle', 'soot']

export const STILL: Portrait = { doing: 'rest', act: 'idle', at: 0, left: REST_BEATS, thoughts: 0 }

const beatsOf = (act: ActName, at: number): number => (at === 0 && STANDING.includes(act) ? REST_BEATS : (ACTS[act][at]?.[1] ?? 1))

const show = (portrait: Portrait, doing: Doing, act: ActName): Portrait => ({ ...portrait, doing, act, at: 0, left: beatsOf(act, 0), thoughts: portrait.thoughts + (doing === 'think' ? 1 : 0) })

const opening = (portrait: Portrait, doing: Doing): ActName =>
  doing === 'rest' ? 'idle' : doing === 'think' ? (THOUGHTS[portrait.thoughts % THOUGHTS.length] ?? 'ponder') : doing === 'failed' ? 'burn' : doing === 'done' ? 'stars' : doing

/** What follows an act that has ended with nothing new to show: the fire and the stars come once. */
const followUp = (portrait: Portrait, doing: Doing): ActName => (doing === 'failed' ? 'soot' : doing === 'done' ? 'idle' : opening(portrait, doing))

/** Resting and thinking give way at once, and everything gives way to a failure; a step's act ends first. */
const givesWay = (portrait: Portrait, to: Doing): boolean => STANDING.includes(portrait.act) || THOUGHTS.includes(portrait.act) || to === 'failed'

/** One beat. */
export function next(portrait: Portrait, doing: Doing): Portrait {
  if (doing !== portrait.doing && givesWay(portrait, doing)) return show(portrait, doing, opening(portrait, doing))
  if (portrait.left > 1) return { ...portrait, left: portrait.left - 1 }
  const at = portrait.at + 1
  if (at < ACTS[portrait.act].length) return { ...portrait, at, left: beatsOf(portrait.act, at) }
  return doing === portrait.doing ? show(portrait, doing, followUp(portrait, doing)) : show(portrait, doing, opening(portrait, doing))
}

/** Whether he only stands there. */
export const isStanding = ({ act, at }: Portrait): boolean => at === 0 && STANDING.includes(act)

/** The picture's file, from the plugin's folder. */
export const pictureOf = ({ act, at }: Portrait): string => `art/dante/${act}/${String(ACTS[act][at]?.[0] ?? 0).padStart(2, '0')}.png`

export interface State {
  /** The steps whose tools are running, oldest first. */
  calls: readonly StepId[]
  isFailed: boolean
  isDone: boolean
  isWorking: boolean
}

export const doingOf = ({ calls, isFailed, isDone, isWorking }: State): Doing => calls.at(-1) ?? (isFailed ? 'failed' : isDone ? 'done' : isWorking ? 'think' : 'rest')
