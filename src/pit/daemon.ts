// Draws the pit for the terminal to read. The Inferno mod starts it (it cannot write binary files
// itself) and stops it with the pane. Each frame is a PNG file; its path goes to stdout and from
// there to the terminal, which reads the file itself, so no pixel crosses the chat.
//
//   node daemon.js <state.json> <out dir> <width> <height> <scale>
//
// width and height are screen pixels; scale is how many of them one pixel of the drawing takes.
// state.json: { depth, mood, isDone, pace: "full" | "calm" | "off", stop? }, rewritten by the mod as the
// request moves on. Output: one line per frame, `pit <absolute path> <number>`.
import { mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { encodePng } from './png.js'
import { Pit, type Goal } from './scene.js'

interface State extends Goal {
  pace: 'full' | 'calm' | 'off'
  stop?: boolean
}

/** With nothing happening for this long, the picture stands still. */
const REST_AFTER_S = 300
const LOST_AFTER_MS = 15_000
const FILES = 4

const [stateArg, outArg, widthArg, heightArg, scaleArg] = process.argv.slice(2)
const W = Number(widthArg)
const H = Number(heightArg)
const scale = Number(scaleArg)
if (!stateArg || !outArg || !(W > 0 && W <= 4096) || !(H > 0 && H <= 4096) || !(scale >= 1 && scale <= 16)) {
  process.stderr.write('usage: daemon <state.json> <out dir> <width> <height> <scale>\n')
  process.exit(2)
}
const statePath = resolve(stateArg)
const out = resolve(outArg)
mkdirSync(out, { recursive: true, mode: 0o700 })

const w = Math.ceil(W / scale)
const h = Math.ceil(H / scale)
const pit = new Pit(w, h)
const parent = process.ppid
let state: State = { depth: 0, mood: 'idle', isDone: false, pace: 'full' }
let mtime = -1
let seenAt = Date.now()
let changed = true
let rested = 0
let count = 0
let last = Date.now()

function leave(): never {
  for (let n = 0; n < FILES; n++) rmSync(join(out, `pit${n}.png`), { force: true })
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

function reload(): void {
  try {
    const stat = statSync(statePath)
    seenAt = Date.now()
    if (stat.mtimeMs === mtime) return
    mtime = stat.mtimeMs
    state = { ...state, ...(JSON.parse(readFileSync(statePath, 'utf8')) as Partial<State>) }
    changed = true
  } catch {
    // Not written yet, or caught mid-write: the next look reads it whole.
  }
}

function emit(dt: number): void {
  const file = join(out, `pit${count % FILES}.png`)
  writeFileSync(`${file}.tmp`, encodePng(pit.frame(state, dt), w, h, scale, W, H))
  renameSync(`${file}.tmp`, file)
  count++
  process.stdout.write(`pit ${file} ${count}\n`)
}

function tick(): void {
  const now = Date.now()
  reload()
  if (state.stop === true || process.ppid !== parent || now - seenAt > LOST_AFTER_MS) leave()
  if (state.pace === 'off') {
    // No movement: one picture of where things stand, each time that changes.
    if (changed) {
      for (let n = 0; n < 400 && !pit.isSettled(state); n++) pit.frame(state, 0.1)
      emit(0.1)
    }
    changed = false
    setTimeout(tick, 250)
    return
  }
  const isBusy = state.mood === 'running' || state.mood === 'failed' || !pit.isSettled(state)
  const isCalm = state.pace === 'calm'
  if (changed || isBusy) rested = 0
  const isStill = !isBusy && !changed && (isCalm || rested > REST_AFTER_S)
  const every = isBusy ? (isCalm ? 160 : 83) : 200
  if (!isStill) {
    const dt = Math.min(0.25, (now - last) / 1000)
    rested += dt
    emit(dt)
  }
  changed = false
  last = now
  setTimeout(tick, Math.max(5, (isStill ? 250 : every) - (Date.now() - now)))
}

tick()
