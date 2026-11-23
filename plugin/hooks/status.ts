// The session's figures, as `dist/feed.js` leaves them in $DANTE_RUN/status.json each time Claude Code
// runs the status line, and how the header shows them. Every figure is Claude Code's own.
import type { words } from './words'

type Words = ReturnType<typeof words>

/** When a limit refills. `weekday`: 0 is Sunday. */
export type Refill = { weekday: number; clock: string }
export type Window = { left: number; resets: Refill | null }

export type Status = {
  model: string
  effort: string | null
  fast: boolean
  agent: string | null
  cwd: string
  branch: string | null
  context: { left: number; tokens: number; window: number } | null
  fiveHour: Window | null
  sevenDay: Window | null
  cost: number
  added: number
  removed: number
}

export const INK = {
  dim: '#8E8A82',
  paper: '#F0EDE6',
  cyan: '#00E5E5',
  yellow: '#FFD400',
  green: '#00FF00',
  red: '#FF2D2D',
  blue: '#3B8CFF',
  pink: '#FF4FD8',
  void: '#2A2A28',
  rule: '#3A3834',
} as const

/** Low to high, one colour for each tenth that is left: nearly spent reads red on its own. */
const RAMP = ['#FF2D2D', '#FF6B00', '#FFD400', '#A8E000', '#00FF00', '#00E5A0', '#00E5E5', '#3B8CFF', '#8B5CFF', '#FF4FD8'] as const

export type Piece = { text: string; color: string; bold?: boolean }

/** A label, a value, a gauge of what is left (0 to 100; absent, no gauge) and a line under it. */
export type Tile = { label: string; value: Piece; left?: number; detail: readonly Piece[] }

const EFFORT: Readonly<Record<string, Piece>> = {
  low: { text: 'LOW', color: INK.blue },
  medium: { text: 'MED', color: INK.cyan },
  xhigh: { text: 'XHIGH', color: INK.yellow },
  max: { text: 'MAX', color: INK.pink },
}

export const levelColor = (left: number): string => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(left / 10)))] ?? INK.paper

/** The gauge as runs of one colour: the filled part climbs the ramp, the rest is a faint line. */
export function gaugeOf(left: number, cells: number): readonly Piece[] {
  const full = Math.max(0, Math.min(cells, Math.floor((left * cells) / 100)))
  const runs: Piece[] = []
  for (let at = 0; at < full; at++) {
    const color = levelColor((at * 100) / cells)
    const last = runs.at(-1)
    if (last?.color === color) last.text += '━'
    else runs.push({ text: '━', color })
  }
  return full < cells ? [...runs, { text: '─'.repeat(cells - full), color: INK.void }] : runs
}

export function parseStatus(text: string): Status | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const object = (value: unknown) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null)
  const string = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const refill = (value: unknown): Refill | null => {
    const one = object(value)
    const clock = string(one?.clock)
    return clock === null ? null : { weekday: number(one?.weekday), clock }
  }
  const window = (value: unknown): Window | null => {
    const one = object(value)
    return typeof one?.left !== 'number' ? null : { left: one.left, resets: refill(one.resets) }
  }
  const fields = object(data)
  if (fields === null) return null
  const context = object(fields.context)
  return {
    model: string(fields.model) ?? '',
    effort: string(fields.effort),
    fast: fields.fast === true,
    agent: string(fields.agent),
    cwd: string(fields.cwd) ?? '',
    branch: string(fields.branch),
    context: context === null ? null : { left: number(context.left), tokens: number(context.tokens), window: number(context.window) },
    fiveHour: window(fields.fiveHour),
    sevenDay: window(fields.sevenDay),
    cost: number(fields.cost),
    added: number(fields.added),
    removed: number(fields.removed),
  }
}

const compact = (tokens: number): string =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)

const dim = (text: string): Piece => ({ text, color: INK.dim })

/** Most useful first: a narrow terminal drops them from the end. */
export function tilesOf(status: Status, w: Words): readonly Tile[] {
  const s = w.figures
  const waiting = (label: string): Tile => ({ label, value: dim('—'), detail: [dim(s.waiting)] })
  const limit = (label: string, one: Window | null, when: (refill: Refill) => string): Tile =>
    one === null
      ? waiting(label)
      : { label, value: { text: s.left(one.left), color: levelColor(one.left) }, left: one.left, detail: [dim(one.resets === null ? s.refillUnknown : when(one.resets))] }
  const { context, added, removed } = status
  return [
    context === null || context.tokens === 0
      ? waiting(s.memory)
      : { label: s.memory, value: { text: s.left(context.left), color: INK.paper }, left: context.left, detail: [dim(s.used(compact(context.tokens), compact(context.window)))] },
    limit(s.fiveHour, status.fiveHour, refill => s.refillsAt(refill.clock)),
    limit(s.sevenDay, status.sevenDay, refill => s.refillsOn(s.days[refill.weekday] ?? '', refill.clock)),
    {
      label: s.cost,
      value: dim(`$${status.cost.toFixed(2)}`),
      detail: added + removed === 0 ? [dim(s.session)] : [dim(`${s.lines} `), { text: `+${added}`, color: INK.green }, { text: ` −${removed}`, color: INK.red }],
    },
  ]
}

/** The model, then the modes that are off their default. */
export function modelPieces(status: Status): readonly Piece[] {
  const effort = status.effort === null || status.effort === 'high' ? null : status.effort
  const lit: (Piece | null)[] = [
    status.model === '' ? null : { text: status.model, color: INK.yellow },
    status.fast ? { text: 'FAST', color: INK.green } : null,
    effort === null ? null : (EFFORT[effort] ?? { text: effort, color: INK.yellow }),
    status.agent === null ? null : { text: `● ${status.agent}`, color: INK.pink },
  ]
  return lit.filter(piece => piece !== null).flatMap((piece, n) => (n === 0 ? [piece] : [{ text: ' · ', color: INK.rule }, piece]))
}

/** Parents recede, the folder it is in leads. */
export function pathPieces(path: string): readonly Piece[] {
  const cut = path.lastIndexOf('/') + 1
  return [dim(path.slice(0, cut)), { text: path.slice(cut), color: INK.paper, bold: true }].filter(piece => piece.text !== '')
}

/** How many tiles fit to the right of what takes `beside` columns. */
export const tilesThatFit = (columns: number, beside: number, tile: number, count: number): number => Math.max(0, Math.min(count, Math.floor((columns - beside) / tile)))
