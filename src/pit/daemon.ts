// Draws the pictures for the terminal to read: the pit beside the chat, and the burning rule under
// the header. The Inferno mod starts it (it cannot write binary files itself) and stops it. Each
// frame is a PNG file; its path goes to stdout and from there to the terminal, which reads the file
// itself, so no pixel crosses the chat.
//
//   node daemon.js <state.json> <out dir>
//
// state.json, rewritten by the mod as the request moves on:
//   { depth, mood, isDone, labels, jump, pace: "full" | "calm" | "off",
//     pit?: { width, height, scale }, rule?: { width, height, scale }, heat, stop? }
// Sizes are screen pixels; scale is how many of them one pixel of the drawing takes.
// Output: one line per frame, `pit <absolute path> <number> <width>x<height>`, and `rule …` alike.
import { mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { encodePng } from './png.js'
import { CLEAR, Rule } from './rule.js'
import { Pit, type Goal, type Labels } from './scene.js'

interface Size {
  width: number
  height: number
  scale: number
}

interface State extends Goal {
  labels?: Labels
  pace: 'full' | 'calm' | 'off'
  /** Changes when they are to be put at `depth` at once. */
  jump?: number
  pit?: Size
  rule?: Size
  /** Of the rule: 1 burns, about 0.2 glows, 0 is out. */
  heat?: number
  stop?: boolean
}

/** With nothing happening for this long, the picture stands still. */
const REST_AFTER_S = 300
const LOST_AFTER_MS = 15_000
const FILES = 4

const [stateArg, outArg] = process.argv.slice(2)
if (!stateArg || !outArg) {
  process.stderr.write('usage: daemon <state.json> <out dir>\n')
  process.exit(2)
}
const statePath = resolve(stateArg)
const out = resolve(outArg)
mkdirSync(out, { recursive: true, mode: 0o700 })

const isSize = (size: Size | undefined): size is Size =>
  size !== undefined && size.width > 0 && size.width <= 8192 && size.height > 0 && size.height <= 4096 && size.scale >= 1 && size.scale <= 16

const parent = process.ppid
let state: State = { depth: -1, mood: 'idle', isDone: false, pace: 'full' }
let pit: { size: Size; scene: Pit; count: number } | undefined
let rule: { size: Size; bed: Rule; count: number } | undefined
let mtime = -1
let seenAt = Date.now()
let changed = true
let jumped = 0
let rested = 0
let last = Date.now()

function leave(): never {
  for (const kind of ['pit', 'rule']) for (let n = 0; n < FILES; n++) rmSync(join(out, `${kind}${n}.png`), { force: true })
  rmSync(statePath, { force: true })
  try {
    rmdirSync(out)
    rmdirSync(dirname(statePath))
  } catch {
    // Not empty, or already gone.
  }
  process.exit(0)
}

// The mod ends this process by closing its output; a lost terminal or a killed session does too.
process.stdout.on('error', leave)
process.on('SIGTERM', leave)
process.on('SIGINT', leave)
process.on('SIGHUP', leave)

const isSame = (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height && a.scale === b.scale

function resize(): void {
  if (!isSize(state.pit)) pit = undefined
  else if (pit === undefined || !isSame(pit.size, state.pit)) {
    const scene = new Pit(Math.ceil(state.pit.width / state.pit.scale), Math.ceil(state.pit.height / state.pit.scale))
    // A new size picks up where the request is; a first one starts before the gate.
    if (pit !== undefined) scene.place(state.depth)
    pit = { size: state.pit, scene, count: pit?.count ?? 0 }
  }
  if (!isSize(state.rule)) rule = undefined
  else if (rule === undefined || !isSame(rule.size, state.rule)) {
    rule = { size: state.rule, bed: new Rule(Math.ceil(state.rule.width / state.rule.scale), Math.ceil(state.rule.height / state.rule.scale)), count: rule?.count ?? 0 }
  }
}

function reload(): void {
  try {
    const stat = statSync(statePath)
    seenAt = Date.now()
    if (stat.mtimeMs === mtime) return
    mtime = stat.mtimeMs
    // Sizes and labels that are not there any more are gone.
    const { depth, mood, isDone, pace } = state
    state = { depth, mood, isDone, pace, ...(JSON.parse(readFileSync(statePath, 'utf8')) as Partial<State>) }
    changed = true
    resize()
    if (pit !== undefined && state.labels !== undefined) pit.scene.labels = state.labels
    if (state.jump !== undefined && state.jump !== jumped) {
      jumped = state.jump
      if (jumped > 0) pit?.scene.place(state.depth)
    }
  } catch {
    // Not written yet, or caught mid-write: the next look reads it whole.
  }
}

function emit(kind: 'pit' | 'rule', count: number, size: Size, png: Buffer): void {
  const file = join(out, `${kind}${count % FILES}.png`)
  writeFileSync(`${file}.tmp`, png)
  renameSync(`${file}.tmp`, file)
  process.stdout.write(`${kind} ${file} ${count + 1} ${size.width}x${size.height}\n`)
}

function paintPit(dt: number): void {
  if (pit === undefined) return
  const { scene, size } = pit
  emit('pit', pit.count++, size, encodePng(scene.frame(state, dt), scene.w, scene.h, size.scale, size.width, size.height))
}

function paintRule(dt: number): void {
  if (rule === undefined) return
  const { bed, size } = rule
  emit('rule', rule.count++, size, encodePng(bed.frame(state.heat ?? 0, dt), bed.w, bed.h, size.scale, size.width, size.height, CLEAR))
}

function tick(): void {
  const now = Date.now()
  reload()
  if (state.stop === true || process.ppid !== parent || now - seenAt > LOST_AFTER_MS) leave()
  if (state.pace === 'off') {
    // No movement: one picture of where things stand, each time that changes.
    if (changed) {
      if (pit !== undefined) for (let n = 0; n < 2400 && !pit.scene.isSettled(state); n++) pit.scene.frame(state, 0.1)
      paintPit(0.1)
      paintRule(0.1)
    }
    changed = false
    setTimeout(tick, 250)
    return
  }
  const isBurning = rule !== undefined && ((state.heat ?? 0) > 0.5 || !rule.bed.isSettled(state.heat ?? 0))
  const isBusy = state.mood === 'running' || isBurning || (pit !== undefined && !pit.scene.isSettled(state))
  const isCalm = state.pace === 'calm'
  if (changed || isBusy) rested = 0
  const isStill = !isBusy && !changed && (isCalm || rested > REST_AFTER_S)
  if (!isStill) {
    const dt = Math.min(0.25, (now - last) / 1000)
    rested += dt
    paintPit(dt)
    paintRule(dt)
  }
  changed = false
  last = now
  const every = isStill ? 250 : isBusy ? (isCalm ? 160 : 83) : state.mood === 'failed' ? 110 : 200
  setTimeout(tick, Math.max(5, every - (Date.now() - now)))
}

tick()
