import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Films, Journey, TaskList, TransferRow } from '../types'
import { PORTRAIT } from './acts'
import { afterCall, idsIn, NO_FILMS, withFilm } from './film'
import { draw, drawRule, makeScene, toCells, type Scene } from './inferno'
import { danteTool, declaredSteps, downloadOf, enginesThatFailed, factsFrom, faultAt, FRAME_KINDS, isBroken, isDub, isRefusal, outputText, parseTransfers, pitSize, readFrames, reasonOf, RULE_MOST, ruleParts, ruleSize, shortFacts, STEP_OF, targetOf, taskChange, titleOf } from './parse'
import { doingOf, isStanding, next as nextPicture, pictureOf, STILL, type Portrait } from './portrait'
import { advance, factsAt, isSettled, progressOf, REHEARSAL, stopOf, type Motion, type Progress, type Scene as Stop } from './progress'
import { gaugeOf, INK, modelPieces, parseStatus, pathPieces, tilesOf, tilesThatFit, type Piece, type Status } from './status'
import { spoken } from './voice'
import { DANTE, STEPS, words, type Lang, type StepId } from './words'

// Dante's look for Claude Code ("Inferno"): the laurelled profile in the header, the five circles
// above the prompt, one quiet line per Dante tool, the Divine Comedy on the spinner. Every hook
// hands back to the engine when something is not as expected, so the worst case is the stock look.

const PLUGIN = 'dante'
const VERSION = '0.1.1'
const HEADER_ID = 'header'

// Stock Claude Code has no fixed slot at the top of the terminal, so the header is placed as a
// transcript row. A build that has one (DANTE_PINNED_HEADER=1) asks for a `Placed` drawing of this
// plugin's "header" under this requestId, HEADER_ROWS tall; it stays put while the chat scrolls.
const PINNED_REQUEST_ID = 'dante-header'
const HEADER_ROWS = 5
// Beside the portrait: the name, then the session's figures, each a tile. They come from a file the
// status line command (dist/feed.js) rewrites, read this often.
const NAME_COLUMNS = 48
const TILE_COLUMNS = 30
const GAUGE_CELLS = 20
const FIGURES_POLL_MS = 1500

const EMBER = '#D9452B'
const GOLD = '#D4A24C'
const LAUREL = '#8FB65A'

// The circles of Hell, drawn beside the chat (inferno.ts) and repainted in place on this beat.
const PANE_ID = 'inferno'
const PANE_COLUMNS = 46
const CAPTION_ROWS = 2
/** The widest a Raster may be. */
const RULE_COLUMNS = RULE_MOST
const BEAT_MS = 100
/** With nothing happening for this long, the picture stands still. */
const REST_AFTER_S = 300

// Literals on purpose: Claude Code scans these references before running the module.
const journeyAtom = atom({ plugin: 'dante', key: 'journey' } as const, null, { shape: 'journey-3' })
const transfersAtom = atom({ plugin: 'dante', key: 'transfers' } as const, [], { shape: 'transfers-1' })
const tickAtom = atom({ plugin: 'dante', key: 'tick' } as const, 0)
const NO_TASKS: TaskList = { title: '', all: {} }
const filmsAtom = atom({ plugin: 'dante', key: 'films' } as const, NO_FILMS, { shape: 'films-1' })
const tasksAtom = atom({ plugin: 'dante', key: 'tasks' } as const, NO_TASKS, { shape: 'tasks-2' })

type CallState = { tool_use_id?: string | undefined; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }
const markOf = (call: CallState, stopped: ReadonlySet<string>): { glyph: string; color: string } =>
  call.isRunning
    ? { glyph: '◌', color: GOLD }
    : call.isErrored || call.isInterrupted || stopped.has(call.tool_use_id ?? '')
      ? { glyph: '✗', color: EMBER }
      : { glyph: '✓', color: LAUREL }

/** "voicemode · converse" for an MCP tool, the plain name otherwise. */
function genericLabel(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const [, server = '', name = ''] = tool.split('__')
  return `${server.replace(/^plugin_/, '').split('_').at(-1) ?? server} · ${name}`
}

const truncate = (text: string, width: number): string =>
  text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`

const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const displayModel = (id: string): string => {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m === null ? id : `${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}`
}

const pick = <T,>(list: readonly T[], seed: string): T => {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return list[Math.abs(hash) % list.length] as T
}

/** Added last to the system prompt, for this session only. Kept short: it costs on every turn. */
const VOICE = {
  id: 'dante:voice',
  scope: 'session',
  text: `# Dante

This session runs inside Dante (Debrid Aggregator & Navigator Tracker Engine): Claude Code set up as a media concierge, opened in the user's Dante folder. Use the \`dante\` skill and the \`mcp__*dante__*\` tools for anything about finding, choosing, adding or playing films and series; CLAUDE.md in this folder holds the user's tastes. For any other request of three or more steps, declare them with Dante's \`progress\` tool and mark each one when it is really finished. In chat, speak as Dante: a calm guide who knows every circle of the download and the way through a maze of releases and says plainly which one and why, in the user's language and in few words. No theatrics in tables, warnings or anything with numbers. Never print keys, addon config URLs or Keychain values.`,
} as const

type Header = { version: string; model: string; cwd: string }

// Where the terminal shows pictures, the circles are drawn at full resolution by a helper process
// (src/pit/daemon.ts): it writes each frame to a file and the terminal reads the file, so no pixel
// crosses the chat. Elsewhere, or if the helper does not start, block characters draw them.
type Frame = { file: string; format: 'png'; generation: number; width: number; height: number }
type Helper = {
  dir: string
  said: string
  pit: Frame | undefined
  rule: Frame | undefined
  /** What of the rule does not fit in one picture. */
  rule2: Frame | undefined
  refused: number
  /** The pane is up and still the picture is not taken: this terminal does not show it. */
  isUseless: boolean
  isOver: boolean
}
const REFUSED_MOST = 40
/** The rehearsal's film, Night of the Living Dead: in the public domain. */
const REHEARSED_FILM = 'tt0063350'

async function runHelper($: EngineInterface, helper: Helper, node: string, first: string): Promise<void> {
  let pending = ''
  try {
    await $.fs.write(`${helper.dir}/state.json`, first)
    const stream = $.process.spawn({ argv: [node, `${$.plugin.root}/../dist/pit/daemon.js`, `${helper.dir}/state.json`, `${helper.dir}/frames`, `${helper.dir}/../../logos`] })
    for await (const piece of stream) {
      // Leaving the loop ends the process.
      if (helper.isOver) break
      if (piece.stream !== 'stdout') continue
      const heard = readFrames(pending, piece.text)
      pending = heard.rest
      for (const one of FRAME_KINDS.map(kind => heard[kind])) {
        if (one === undefined) continue
        const before = helper[one.kind]
        const frame: Frame = { file: one.file, format: 'png', generation: one.generation, width: one.width, height: one.height }
        helper[one.kind] = frame
        if (before === undefined || before.width !== frame.width || before.height !== frame.height) {
          // The first of its size: from blocks to the picture.
          $.ui.invalidate('ui.render')
          continue
        }
        const source = { file: frame.file, format: frame.format, generation: frame.generation }
        if (one.kind !== 'pit') {
          await $.ui.blit({ requestId: 'dante-header', key: one.kind, source })
          continue
        }
        const painted = await $.ui.blit({ requestId: 'inferno', key: 'pit', source })
        helper.refused = painted.deny === undefined ? 0 : helper.refused + 1
        if (helper.refused > REFUSED_MOST) {
          helper.refused = 0
          if ((await $.ui.panes()).some(pane => pane.id === 'inferno' && pane.isPlaced)) {
            helper.isUseless = true
            helper.isOver = true
          }
        }
      }
      if (helper.isOver) break
    }
  } catch {
    // No node, no file, no terminal: the blocks stay.
  }
  helper.isOver = true
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  let header: Header | null = null
  let lang: Lang = 'en'
  let stopTicking: (() => void) | undefined
  // Whether this build pins the header, and which layout the terminal draws (learnt from the
  // prompt hint's viewport). The main screen has no pinned slot.
  let isPinned = false
  let isFullscreen: boolean | undefined
  let isPlaced = false
  // The session's figures, when the header shows them.
  let figures: Status | null = null
  let figuresText = ''

  // The picture. It follows mirrors of the stored values, so a beat costs no round trip.
  let journeyNow: Journey | null = null
  let tasksNow: TaskList = NO_TASKS
  let filmsNow: Films = NO_FILMS
  let transfersNow: readonly TransferRow[] = []
  let isWorking = false
  let turnFrom = 0
  // The steps whose tools are running now, and Dante's portrait, which acts them out where the
  // header is drawn.
  let calls: readonly StepId[] = []
  let portrait: Portrait = STILL
  let portraitSite = PINNED_REQUEST_ID
  // Calls that ended well but stopped the request: nothing found, or a dead download.
  const stopped = new Set<string>()
  let animation: 'full' | 'calm' | 'off' = 'full'
  let motion: Motion = { depth: 0, stars: 0 }
  let seconds = 0
  let restless = 0
  let beats = 0
  let pit: Scene | undefined
  // What is mounted now, learnt when it draws and forgotten when a repaint is refused.
  let isPitUp = false
  let ruleColumns = 0
  let isRuleHot = false
  let beatTimer: { cancel: () => void } | undefined
  // The helper that draws pictures, when the terminal shows them.
  let isPicture = false
  let cell: string | undefined
  let node = 'node'
  let helperHome: string | undefined
  let helper: Helper | undefined
  let helpers = 0
  // The cells the pane and the header's rule want pictures for, and since which beat.
  let wanted: { columns: number; rows: number; since: number } | undefined
  let ruleWanted: { columns: number; since: number } | undefined
  // How many columns the pane takes from the chat while it is docked.
  let docked = 0
  const settled: { pit?: { columns: number; rows: number }; rule?: { columns: number } } = {}
  const sizes = () => {
    // A size counts once it has held for a moment, so a drag does not rebuild the picture at each step.
    if (wanted === undefined) settled.pit = undefined
    else if (settled.pit === undefined || beats - wanted.since > 4) settled.pit = { columns: wanted.columns, rows: wanted.rows }
    if (ruleWanted === undefined) settled.rule = undefined
    else if (settled.rule === undefined || beats - ruleWanted.since > 4) settled.rule = { columns: ruleWanted.columns }
    return {
      ...(settled.pit === undefined ? {} : { pit: pitSize(settled.pit.columns, settled.pit.rows, cell) }),
      ...(settled.rule === undefined ? {} : { rule: { ...ruleSize(settled.rule.columns, cell), parts: ruleParts(settled.rule.columns).map(columns => ruleSize(columns, cell).width) } }),
    }
  }

  // The five letters and what is cut beside them: the steps of a film, or the share of any other request.
  const marks = (): { title: string; facts: string[]; lit: boolean[]; now: number } => {
    const shown = stop()
    if (shown !== undefined && rehearsal !== undefined) {
      return { title: 'Night of the Living Dead', facts: shortFacts(factsAt(shown, rehearsal.elapsed)), lit: STEPS.map((_, n) => n < shown.did), now: rehearsal.isBroken ? Math.max(0, Math.floor(shown.depth / 2)) : shown.now }
    }
    if (journeyNow !== null) {
      const { title, facts, did, reached, status } = journeyNow
      return { title, facts: shortFacts(facts), lit: STEPS.map(step => did.includes(step)), now: status === 'done' ? -1 : reached }
    }
    const { total, done } = tally()
    const share = total === 0 ? 0 : (done / total) * STEPS.length
    const at = Math.max(0, Math.ceil(share) - 1)
    return {
      title: tasksNow.title,
      facts: STEPS.map((_, i) => (total > 0 && i === at ? `${done}/${total}` : '')),
      lit: STEPS.map((_, i) => i + 1 <= share),
      now: total > 0 && done < total ? Math.floor(share) : -1,
    }
  }

  // What the helper needs to tell the film whose logo the screen shows at the end.
  const film = (title: string) => {
    if (rehearsal === undefined) return { title, ...filmsNow, isSearch: journeyNow !== null }
    return rehearsal.film === '' ? { title, current: REHEARSED_FILM, seen: [], isSearch: true } : { query: rehearsal.film }
  }

  // Why it stopped.
  const reason = (): string => (rehearsal?.isBroken === true ? words(lang).example : journeyNow?.status === 'failed' ? journeyNow.reason : '')

  // The numbers that move something in the picture.
  const numbers = () => {
    const shown = stop()
    const { results, checked, cached, percent } = shown !== undefined && rehearsal !== undefined ? factsAt(shown, rehearsal.elapsed) : (journeyNow?.facts ?? {})
    return { results, checked, cached, percent }
  }

  const helperState = (): string => {
    const to = target()
    const shown = marks()
    const title = rehearsal?.film || shown.title
    return JSON.stringify({ depth: to.depth, mood: to.mood, isDone: to.isDone, jump, pace: animation, heat: to.mood === 'failed' ? 0.06 : isWorking || rehearsal !== undefined ? 1 : 0.22, labels: { circles: words(lang).circles, ...shown, title, ...numbers(), reason: reason() }, film: film(title), ...sizes() })
  }

  // What the helper needs this beat: to start, or to be told something.
  const tend = (): { start?: Helper; tell?: { file: string; text: string } } => {
    if (helper?.isOver === true) {
      // One that never drew anything will not: stay with the blocks.
      if (helper.isUseless || (helper.pit === undefined && helper.rule === undefined)) isPicture = false
      helper = undefined
    }
    if (!isPicture || helperHome === undefined || (wanted === undefined && ruleWanted === undefined)) {
      if (helper !== undefined) helper.isOver = true
      return {}
    }
    const say = helperState()
    if (helper === undefined) {
      helpers += 1
      helper = { dir: `${helperHome}/pit/${helpers}-${Math.random().toString(36).slice(2, 8)}`, said: say, pit: undefined, rule: undefined, rule2: undefined, refused: 0, isUseless: false, isOver: false }
      return { start: helper }
    }
    if (say === helper.said) return {}
    helper.said = say
    return { tell: { file: `${helper.dir}/state.json`, text: say } }
  }

  // The rehearsal: a made-up request to look at the circles with. Never mixed with a real one.
  let rehearsal: { at: number; elapsed: number; isHeld: boolean; isBroken: boolean; film: string } | undefined
  let jump = 0
  let isRedrawDue = false
  const stop = (): Stop | undefined => (rehearsal === undefined ? undefined : REHEARSAL[rehearsal.at])
  const rehearse = (at: number, isHeld: boolean, isBroken = false, film = '') => {
    const bounded = Math.max(0, Math.min(REHEARSAL.length - 1, at))
    rehearsal = { at: bounded, elapsed: 0, isHeld, isBroken, film }
    jump += 1
    motion = { depth: REHEARSAL[bounded]?.depth ?? 0, stars: 0 }
    isRedrawDue = true
  }
  const endRehearsal = () => {
    if (rehearsal === undefined) return
    rehearsal = undefined
    jump += 1
    isRedrawDue = true
  }

  const tally = () => {
    const all = Object.values(tasksNow.all)
    return { total: all.length, done: all.filter(one => one === 'done').length }
  }

  const target = (): Progress => {
    const shown = stop()
    if (shown !== undefined && rehearsal !== undefined) {
      if (rehearsal.isBroken) return { depth: Math.max(0, shown.depth), mood: 'failed', isDone: false }
      const percent = shown.isDownload === true ? (factsAt(shown, rehearsal.elapsed).percent ?? 0) : 0
      return { depth: shown.depth + Math.min(0.99, percent / 100), mood: shown.isDone === true ? 'done' : shown.depth < 0 ? 'idle' : 'running', isDone: shown.isDone === true }
    }
    return progressOf({ journey: journeyNow, tasks: tally(), download: downloadOf(transfersNow), isWorking })
  }

  const doing = () => {
    const shown = stop()
    if (shown === undefined || rehearsal === undefined) {
      const { mood, isDone } = target()
      return doingOf({ calls, isFailed: mood === 'failed', isDone, isWorking })
    }
    const step = STEPS[shown.now]
    return doingOf({ calls: step === undefined || rehearsal.isBroken ? [] : [step], isFailed: rehearsal.isBroken, isDone: shown.isDone === true, isWorking: shown.depth >= 0 })
  }

  const pitCells = (): string | undefined =>
    pit === undefined
      ? undefined
      : toCells(draw(pit, { depth: motion.depth, mood: target().mood, t: seconds, stars: motion.stars }), pit.w, pit.h)

  const ruleCells = (columns: number): string => drawRule(columns, seconds, target().mood === 'failed' ? 0 : isWorking || rehearsal !== undefined ? 1 : 0.2)

  // One beat: move the picture on, and say what needs repainting.
  const beat = (): { pit?: string; rule?: string; portrait?: string } => {
    const to = target()
    const isBusy = isWorking || rehearsal !== undefined || !isSettled(motion, to)
    beats += 1
    seconds += BEAT_MS / 1000
    const shown = stop()
    if (shown !== undefined && rehearsal !== undefined) {
      rehearsal.elapsed += BEAT_MS / 1000
      if (shown.isDownload === true && beats % 5 === 0) isRedrawDue = true
      if (rehearsal.isHeld) {
        // Held on one circle, its download runs again and again.
        if (rehearsal.elapsed > shown.seconds) rehearsal.elapsed = 0
      } else if (rehearsal.elapsed > shown.seconds) {
        if (rehearsal.at + 1 >= REHEARSAL.length) endRehearsal()
        else rehearsal = { ...rehearsal, at: rehearsal.at + 1, elapsed: 0 }
        isRedrawDue = true
      }
    }
    restless = isBusy ? 0 : restless + BEAT_MS / 1000
    motion = advance(motion, to, BEAT_MS / 1000)
    const pace = animation === 'off' ? 0 : isBusy ? (animation === 'calm' ? 2 : 1) : animation === 'calm' || restless > REST_AFTER_S ? 0 : 3
    const isDue = pace !== 0 && beats % pace === 0
    // The rule burns while Dante works, and one last cold repaint puts it out.
    const isRuleDue = ruleColumns > 0 && animation !== 'off' && (isWorking ? isDue : isRuleHot)
    isRuleHot = isWorking
    // Calm, he acts at half the speed and stands still between requests.
    const before = pictureOf(portrait)
    const now = doing()
    const isStill = !isPicture || animation === 'off' || (animation === 'calm' && (beats % 2 === 1 || (isStanding(portrait) && now === portrait.doing)))
    if (!isStill) portrait = nextPicture(portrait, now)
    const after = pictureOf(portrait)
    return {
      ...(after === before ? {} : { portrait: after }),
      ...(isPitUp && isDue ? { pit: pitCells() } : {}),
      ...(isRuleDue ? { rule: ruleCells(ruleColumns) } : {}),
    }
  }

  // True once, when the header should become a transcript row.
  const claimPlacement = (): boolean => {
    if (header === null || isPlaced || (isPinned && isFullscreen !== false)) return false
    isPlaced = true
    return true
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const wanted = await $.env.get('DANTE_UI_LANG')
    lang = wanted === 'es' ? 'es' : 'en'
    isPinned = (await $.env.get('DANTE_PINNED_HEADER')) === '1'
    const moves = await $.env.get('DANTE_ANIMATION')
    animation = moves === 'off' || moves === 'calm' ? moves : 'full'
    isPicture = (await $.env.get('DANTE_GRAPHICS')) === 'image'
    cell = await $.env.get('DANTE_CELL')
    node = (await $.env.get('DANTE_NODE')) || 'node'

    if (!e.isInteractive) return result

    // A reload starts the module over; what was stored is still there.
    journeyNow = await read($, journeyAtom)
    tasksNow = await read($, tasksAtom)
    filmsNow = await read($, filmsAtom)
    transfersNow = await read($, transfersAtom)
    motion = { depth: target().depth, stars: target().isDone ? 1 : 0 }

    await $.command.register({ name: 'inferno', description: words(lang).paneHelp, argumentHint: words(lang).hint, immediate: true })
    if ((await $.store.get('pane')) !== 'closed') {
      void $.ui.open({ id: PANE_ID, title: 'Inferno', columns: PANE_COLUMNS }).catch(() => undefined)
    }
    if (isPicture) helperHome = await $.process.hookEnv().then(env => env.CLAUDE_PLUGIN_DATA, () => undefined)
    beatTimer?.cancel()
    if (animation !== 'off' || isPicture) {
      beatTimer = $.clock.every(BEAT_MS, () => {
        const due = beat()
        if (isRedrawDue) {
          isRedrawDue = false
          $.ui.invalidate('ui.render')
        }
        const { start, tell } = tend()
        if (start !== undefined) void runHelper($, start, node, start.said)
        if (tell !== undefined) void $.fs.write(tell.file, tell.text).catch(() => undefined)
        if (due.pit !== undefined) {
          void $.ui
            .blit({ requestId: PANE_ID, key: 'pit', cells: due.pit })
            .then(painted => {
              if (painted.deny !== undefined) isPitUp = false
            })
            .catch(() => {
              isPitUp = false
            })
        }
        if (due.portrait !== undefined) {
          // A header that is not on screen refuses it, which is fine.
          void $.ui.blit({ requestId: portraitSite, key: 'portrait', source: { file: `${$.plugin.root}/${due.portrait}`, format: 'png' } }).catch(() => undefined)
        }
        if (due.rule !== undefined) {
          void $.ui
            .blit({ requestId: PINNED_REQUEST_ID, key: 'rule', cells: due.rule })
            .then(painted => {
              if (painted.deny !== undefined) ruleColumns = 0
            })
            .catch(() => {
              ruleColumns = 0
            })
        }
      })
    }

    const runDir = await $.env.get('DANTE_RUN')
    if (runDir) {
      $.clock.every(FIGURES_POLL_MS, async () => {
        const text = await $.fs.read(`${runDir}/${await $.session.id()}.json`).catch(() => '')
        if (text === '' || text === figuresText) return
        figuresText = text
        figures = parseStatus(text) ?? figures
        $.ui.invalidate('ui.render')
      })
    }

    const [version, model, home] = await Promise.all([$.session.version(), $.session.model(), $.env.get('HOME')])
    const cwd = home && e.cwd.startsWith(home) ? `~${e.cwd.slice(home.length)}` : e.cwd
    header = { version: version.base ?? version.version, model: displayModel(model), cwd }
    // The pinned header may have drawn blank before this point.
    $.ui.invalidate('ui.render')
    if (claimPlacement()) await $.ui.place({ id: HEADER_ID })
    return result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface === 'terminal' && isFullscreen === undefined && e.viewport?.isFullscreen !== undefined) {
      isFullscreen = e.viewport.isFullscreen
      if (claimPlacement()) await $.ui.place({ id: HEADER_ID })
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const voice = { ...VOICE, text: VOICE.text + spoken(await $.env.get('DANTE_VOICE')) }
    return { sections: [...result.sections.filter(section => section.id !== VOICE.id), voice] }
  })

  on('command.run', { command: 'inferno' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    const broken = /^error(?:\s+([1-9]))?$/.exec(asked)
    const starred = /^stars(?:\s+(.+))?$/.exec(asked)
    const circle = /^[1-9]$/.test(asked) ? Number(asked) : broken !== null ? Number(broken[1] ?? 5) : undefined
    if (asked === 'demo' || circle !== undefined || starred !== null) {
      await $.store.set('pane', 'open')
      await $.ui.open({ id: PANE_ID, title: 'Inferno', columns: PANE_COLUMNS })
      if (starred !== null) rehearse(REHEARSAL.length - 1, true, false, starred[1] ?? '')
      else if (circle === undefined) rehearse(0, false)
      else rehearse(stopOf(circle), true, broken !== null)
      return { text: words(lang).rehearsing }
    }
    if (asked === 'stop') {
      endRehearsal()
      return { text: words(lang).rehearsed }
    }
    const isUp = (await $.ui.panes()).some(one => one.id === PANE_ID && one.isPlaced)
    if (isUp) {
      await $.ui.close({ id: PANE_ID })
      await $.store.set('pane', 'closed')
      isPitUp = false
      wanted = undefined
      docked = 0
      return { text: words(lang).paneClosed }
    }
    await $.store.set('pane', 'open')
    await $.ui.open({ id: PANE_ID, title: 'Inferno', columns: PANE_COLUMNS })
    return { text: words(lang).paneOpened }
  })

  // Closed with its own mark: it stays closed next time too.
  on('ui.close', { id: 'inferno' }, async ($, e, next) => {
    isPitUp = false
    wanted = undefined
    docked = 0
    $.ui.invalidate('ui.render')
    if (e.origin.kind === 'person') await $.store.set('pane', 'closed')
    return next(e)
  })

  // A new request: what was finished (or failed) is put away.
  on('prompt.submit', async ($, e, next) => {
    if (!e.text.startsWith('/')) endRehearsal()
    journeyNow = await update($, journeyAtom, j => (j !== null && j.endedAt !== null && j.status !== 'failed' ? null : j))
    const { total, done } = tally()
    if (total > 0 && done === total) tasksNow = await update($, tasksAtom, () => NO_TASKS)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = true
      turnFrom = await $.clock.now()
    }
    return next(e)
  })

  const titleIn = (input: object): string => ('title' in input && typeof input.title === 'string' ? input.title : '')

  // The journey: which step the current request is in. Other requests: their task list.
  on('tool.call', async ($, e, next) => {
    const isDubbing = e.tool === 'Bash' && isDub(e.tool, e.command)
    const tool = isDubbing ? 'audio4films' : danteTool(e.tool)
    const step = tool === undefined ? undefined : STEP_OF[tool]

    if (tool === undefined) {
      const ran = await next(e)
      if (ran.deny === undefined) {
        // A film may go by in any call: a command that opens it on the TV, an answer that lists it.
        const ids = [...idsIn(JSON.stringify(e)), ...(e.tool === 'Bash' ? idsIn(outputText(ran.result ?? ran.text)) : [])]
        if (ids.length > 0) filmsNow = await update($, filmsAtom, films => ids.reduce((all, id) => withFilm(all, { id, name: '' }), films))
      }
      if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
        const change = taskChange(e.tool, e, ran.result)
        if (change !== undefined) {
          tasksNow = await update($, tasksAtom, list => {
            const { [change.id]: _, ...rest } = list.all
            return { ...list, all: change.to === 'gone' ? rest : { ...rest, [change.id]: change.to } }
          })
        }
      }
      return ran
    }

    // Something real: the rehearsal is over.
    endRehearsal()
    if (step !== undefined) {
      const reached = STEPS.indexOf(step)
      const now = await $.clock.now()
      const title = titleOf(tool, e)
      journeyNow = await update($, journeyAtom, j => {
        // After a failure the same request may go on; another title is another request.
        const isOther = j !== null && j.status === 'failed' && title !== undefined && j.title !== '' && title !== j.title
        const isFresh = j === null || (j.endedAt !== null && j.status !== 'failed') || isOther || tool === 'find_title'
        const base: Journey = isFresh ? { title: title ?? '', reached, status: 'running', startedAt: now, endedAt: null, did: [], facts: {}, reason: '', fault: null, transfer: null } : j
        return { ...base, title: title ?? base.title, reached, status: 'running', endedAt: null, reason: '', fault: null }
      })
      if (stopTicking === undefined) {
        const timer = $.clock.every(1000, () => void update($, tickAtom, t => (t ?? 0) + 1))
        stopTicking = () => timer.cancel()
      }
    }

    if (step !== undefined) calls = [...calls, step]
    const ran = await next(e).finally(() => {
      const mine = step === undefined ? -1 : calls.lastIndexOf(step)
      if (mine >= 0) calls = calls.toSpliced(mine, 1)
    })
    const hasFailed = ran.deny !== undefined || ran.isError === true

    // Steps Claude declares for a request that is not about a film.
    if (!hasFailed) {
      const answered = outputText(ran.result ?? ran.text)
      const isNewList = tool === 'progress' && titleIn(e) !== tasksNow.title
      filmsNow = await update($, filmsAtom, films => afterCall(films, tool, e, answered, isNewList))
    }

    const steps = tool === 'progress' && !hasFailed ? declaredSteps(e) : undefined
    if (steps !== undefined) {
      journeyNow = await update($, journeyAtom, () => null)
      tasksNow = await update($, tasksAtom, () => steps)
    }

    // A dub sent to the background has only started.
    const isPending = isDubbing && e.tool === 'Bash' && e.run_in_background === true

    if (step !== undefined && !isPending) {
      const now = await $.clock.now()
      const reached = STEPS.indexOf(step)
      const answer = ran.deny === undefined ? outputText(ran.result ?? ran.text) : ''
      const found = hasFailed ? {} : factsFrom(tool, e, answer)
      const added = tool === 'add_to_debrid' && !hasFailed ? parseTransfers(tool, answer).at(-1) : undefined
      // Nothing found is the end of the way too, and so is a download that will not finish.
      const isEmpty = !hasFailed && ((tool === 'search_streams' && found.results === 0) || (tool === 'find_title' && /^No title found/.test(answer)))
      const isDead = added !== undefined && isBroken(added)
      // A person's no stops the request, but nothing is wrong.
      const isRefused = ran.deny !== undefined || (hasFailed && isRefusal(answer))
      const isStopped = !isRefused && (hasFailed || isEmpty || isDead)
      if (isStopped && !hasFailed) stopped.add(e.tool_use_id)
      const why = !isStopped ? '' : isEmpty ? reasonOf(enginesThatFailed(answer)) || words(lang).nothing : isDead ? reasonOf(added.status) : reasonOf(answer) || words(lang).failed
      journeyNow = await update($, journeyAtom, j =>
        j === null || j.reached !== reached
          ? j
          : {
              ...j,
              status: isStopped ? 'failed' : isRefused ? 'running' : 'done',
              endedAt: (step === 'play' && !isRefused) || isStopped ? now : null,
              did: isStopped || isRefused || j.did.includes(step) ? j.did : [...j.did, step],
              facts: { ...j.facts, ...found },
              reason: why,
              fault: isStopped ? faultAt(tool, answer, isEmpty) : null,
              transfer: added === undefined ? j.transfer : `${added.service} ${added.id}`,
            },
      )
      if (step === 'play' || isStopped) {
        stopTicking?.()
        stopTicking = undefined
      }
    }

    if (!hasFailed && ran.deny === undefined) {
      const rows = parseTransfers(tool, outputText(ran.result ?? ran.text))
      if (rows.length && step === undefined) {
        // How the download goes: no step of its own, but the request's own number.
        const found = factsFrom(tool, e, outputText(ran.result ?? ran.text))
        const now = await $.clock.now()
        journeyNow = await update($, journeyAtom, j => {
          if (j === null) return j
          // Of all the downloads there, only the one this request added can stop it.
          const own = rows.find(row => `${row.service} ${row.id}` === j.transfer)
          const isDead = own !== undefined && isBroken(own) && j.status !== 'failed'
          const gone = isDead ? { status: 'failed' as const, endedAt: now, reason: reasonOf(own.status), fault: 6, did: j.did.filter(done => done !== 'add') } : {}
          return { ...j, facts: { ...j.facts, ...found }, ...gone }
        })
      }
      if (rows.length) {
        transfersNow = await update($, transfersAtom, list => {
          const kept = list.filter(r => !rows.some(n => n.service === r.service && n.id === r.id))
          return [...kept, ...rows].slice(-5)
        })
      }
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      calls = []
      // A failure is shown until a whole turn has gone by without it.
      journeyNow = await update($, journeyAtom, j => (j !== null && j.status === 'failed' && (j.endedAt ?? 0) < turnFrom ? null : j))
      stopTicking?.()
      stopTicking = undefined
    }
    return next(e)
  })

  // Header: laurelled Dante beside name, version, model and folder, and the session's figures.
  on('ui.render', { component: 'Placed' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.id !== HEADER_ID || header === null || e.surface !== 'terminal') {
      return next(e)
    }
    const { Box, Image, Raster, Text } = $.ui.resolve(e)
    portraitSite = isPinned && isFullscreen !== false ? PINNED_REQUEST_ID : e.requestId
    // The slot is as wide as the terminal; with a pane docked the viewport is the chat's alone.
    const across = Math.max(1, Math.min(RULE_COLUMNS, (e.viewport?.columns ?? 80) + docked))
    const inked = (pieces: readonly Piece[]) => pieces.map((piece, n) => <Text key={`piece${n}`} color={piece.color} bold={piece.bold === true}>{piece.text}</Text>)
    const tiles = figures === null ? [] : tilesOf(figures, words(lang))
    const shown = tiles.slice(0, tilesThatFit(across, PORTRAIT.columns + NAME_COLUMNS, TILE_COLUMNS, tiles.length))
    const identity = (
      <Box flexDirection="row" height={PORTRAIT.rows}>
        <Image
          key="portrait"
          source={{ file: `${$.plugin.root}/${pictureOf(portrait)}`, format: 'png' }}
          columns={PORTRAIT.columns}
          rows={PORTRAIT.rows}
          alt="Dante"
        />
        <Box flexDirection="column" justifyContent="center" paddingLeft={2} {...(shown.length > 0 ? { width: NAME_COLUMNS, flexShrink: 0 } : {})}>
          <Text>
            <Text bold color={EMBER}>
              DANTE
            </Text>
            <Text dimColor> v{VERSION}</Text>
          </Text>
          <Text>
            {DANTE.map(word => (
              <Text key={word}>
                <Text bold color={GOLD}>
                  {word.slice(0, 1)}
                </Text>
                <Text dimColor>{word.slice(1)} </Text>
              </Text>
            ))}
          </Text>
          {figures === null ? (
            <Text dimColor>
              {header.model} · Claude Code {header.version}
            </Text>
          ) : (
            <Text wrap="truncate">
              {inked(modelPieces(figures))}
              <Text dimColor> · Claude Code {header.version}</Text>
            </Text>
          )}
          {figures === null ? (
            <Text dimColor>{header.cwd}</Text>
          ) : (
            <Text wrap="truncate">
              {inked(pathPieces(figures.cwd || header.cwd))}
              {figures.branch === null ? null : <Text color={INK.cyan}> {words(lang).figures.branch(figures.branch)}</Text>}
            </Text>
          )}
        </Box>
        {shown.map(tile => (
          <Box key={tile.label} flexDirection="column" width={TILE_COLUMNS} flexShrink={0}>
            <Text color={INK.dim}>{tile.label}</Text>
            <Text color={tile.value.color}>{tile.value.text}</Text>
            <Text>{tile.left === undefined ? ' ' : inked(gaugeOf(tile.left, GAUGE_CELLS))}</Text>
            <Text>{inked(tile.detail)}</Text>
          </Box>
        ))}
      </Box>
    )
    if (e.requestId !== PINNED_REQUEST_ID) {
      return (
        <Box flexDirection="column" paddingY={1}>
          {identity}
        </Box>
      )
    }
    // Pinned: exactly HEADER_ROWS tall, closed by a rule of coals the chat scrolls under. It burns
    // while Dante works.
    if (isPicture && (ruleWanted === undefined || ruleWanted.columns !== across)) ruleWanted = { columns: across, since: beats }
    const burning = ruleParts(across).flatMap((columns, n) => {
      const size = ruleSize(columns, cell)
      const drawn = !isPicture ? undefined : n === 0 ? helper?.rule : helper?.rule2
      return drawn !== undefined && drawn.width === size.width && drawn.height === size.height ? [{ ...drawn, columns }] : []
    })
    const isBurning = burning.length === ruleParts(across).length
    ruleColumns = isBurning ? 0 : RULE_COLUMNS
    return (
      <Box flexDirection="column" height={HEADER_ROWS} overflow="hidden">
        {identity}
        {isBurning ? (
          <Box flexDirection="row" height={1} flexShrink={0}>
            {burning.map(({ file, format, generation, columns }, n) => (
              <Image key={n === 0 ? 'rule' : 'rule2'} source={{ file, format, generation }} columns={columns} rows={1} alt=" " />
            ))}
          </Box>
        ) : (
          <Raster key="rule" columns={RULE_COLUMNS} rows={1} cells={ruleCells(RULE_COLUMNS)} />
        )}
      </Box>
    )
  })

  // The circles of Hell beside the chat.
  on('ui.render', { component: 'Pane', requestId: 'inferno' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const journey = await read($, journeyAtom)
    await read($, tasksAtom)
    await read($, transfersAtom)
    await read($, tickAtom)
    const now = await $.clock.now()
    const { Box, Button, Image, Raster, Text } = $.ui.resolve(e)
    const w = words(lang)
    const to = target()

    const columns = Math.min(72, e.props.bodyColumns)
    const rows = Math.min(64, e.props.scroll.bodyRows - CAPTION_ROWS)
    const fits = columns >= 24 && rows >= 22
    if (!fits) pit = undefined
    else if (pit === undefined || pit.w !== columns || pit.h !== rows * 2) pit = makeScene(columns, rows * 2)
    if (!fits) wanted = undefined
    else if (wanted === undefined || wanted.columns !== columns || wanted.rows !== rows) wanted = { columns, rows, since: beats }
    const taken = e.props.placement === 'dock' ? e.props.bodyColumns + 1 : 0
    if (taken !== docked) {
      // The rule under the header is as wide as the chat and this pane together.
      docked = taken
      isRedrawDue = true
    }
    const size = pitSize(columns, rows, cell)
    const drawn = isPicture && fits ? helper?.pit : undefined
    const picture = drawn !== undefined && drawn.width === size.width && drawn.height === size.height ? drawn : undefined
    const cells = picture === undefined ? pitCells() : undefined
    isPitUp = cells !== undefined
    if (animation === 'off') motion = { depth: to.depth, stars: to.isDone ? 1 : 0 }

    // One line: what the numbers cut in the rock are.
    const { total, done } = tally()
    const said =
      journey !== null
        ? w.found(journey.facts, journey.title)
        : total > 0
          ? [w.tasks(done, total), tasksNow.title]
          : []
    const shown = stop()
    const line =
      shown !== undefined && rehearsal !== undefined
        ? rehearsal.isBroken
          ? `${w.failed}: ${w.example}`
          : shown.isDone === true
            ? w.verseEnd
            : w.found(factsAt(shown, rehearsal.elapsed), shown.did > 0 ? 'Night of the Living Dead' : '').filter(Boolean).join(' · ') || w.circle(Math.max(0, Math.floor(shown.depth)))
        : to.isDone
          ? w.verseEnd
          : journey?.status === 'failed'
            ? `${w.steps[STEPS[journey.reached] ?? 'title']}: ${journey.reason || w.failed}`
            : said.filter(Boolean).join(' · ')
    return (
      <Box flexDirection="column">
        {picture === undefined ? null : <Image key="pit" source={{ file: picture.file, format: picture.format, generation: picture.generation }} columns={columns} rows={rows} alt="Inferno" />}
        {cells === undefined ? null : <Raster key="pit" columns={columns} rows={rows} cells={cells} />}
        <Text color={to.mood === 'failed' ? EMBER : GOLD} wrap={rehearsal === undefined ? 'wrap' : 'truncate-end'}>
          {truncate(line, rehearsal === undefined ? columns * CAPTION_ROWS - 8 : columns)}
        </Text>
        {rehearsal === undefined ? null : (
          <Box flexDirection="row">
            <Text dimColor>{truncate(w.rehearsal(rehearsal.at + 1, REHEARSAL.length), Math.max(10, columns - 18))} </Text>
            <Button key="back" label="‹" hotkey="a" onPress={() => rehearse((rehearsal?.at ?? 1) - 1, true, rehearsal?.isBroken)} />
            <Button key="on" label="›" hotkey="s" onPress={() => rehearse((rehearsal?.at ?? -1) + 1, true, rehearsal?.isBroken)} />
            <Button key="end" label="✕" hotkey="x" onPress={endRehearsal} />
          </Box>
        )}
      </Box>
    )
  })

  // The person's message: an ember bar instead of the grey block.
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer' || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={EMBER}>▎</Text>
        <Text color={GOLD}>▎</Text>
        <Text bold> {e.props.text}</Text>
      </Box>
    )
  })

  // A reply opens with a gold laurel mark.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.props.isFirstOfReply) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const body = await next({ ...e, props: { ...e.props, isFirstOfReply: false } })
    return (
      <Box flexDirection="row">
        <Box marginTop={1} marginRight={1}>
          <Text color={GOLD}>❧</Text>
        </Box>
        {body}
      </Box>
    )
  })

  // One quiet line per Dante tool: mark, verb, target.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    const tool = danteTool(e.props.tool)
    if (e.surface !== 'terminal' || e.props.isExpanded || tool === undefined) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const mark = markOf(e.props, stopped)
    const verb = words(lang).verbs[tool] ?? tool
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 16)
    return (
      <Box flexDirection="row">
        <Text color={mark.color}>{mark.glyph} </Text>
        <Text color={GOLD}>{verb.padEnd(9)}</Text>
        <Text>{truncate(targetOf(tool, e.props.input, lang), width)}</Text>
      </Box>
    )
  })

  // Runs of calls the engine folds into one line: when Dante is among them, draw each call.
  // Anything but plain calls keeps the engine's drawing.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (
      e.surface !== 'terminal' ||
      e.props.isExpanded ||
      e.props.isCallsOnly === false ||
      !e.props.calls.some(call => danteTool(call.tool) !== undefined)
    ) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 16)
    return (
      <Box flexDirection="column">
        {e.props.calls.map((call, i) => {
          const tool = danteTool(call.tool)
          const mark = markOf(call, stopped)
          const verb = tool === undefined ? genericLabel(call.tool) : (words(lang).verbs[tool] ?? tool)
          const target = tool === undefined ? '' : targetOf(tool, call.input, lang)
          return (
            <Box key={`call${i}`} flexDirection="row">
              <Text color={mark.color}>{mark.glyph} </Text>
              <Text color={tool === undefined ? undefined : GOLD} dimColor={tool === undefined}>
                {tool === undefined ? verb : verb.padEnd(9)}
              </Text>
              <Text>{truncate(target, width)}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })

  // The first line of a Dante result (the summary); ctrl+o shows it all.
  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    const tool = danteTool(e.props.tool)
    if (e.surface !== 'terminal' || e.props.isExpanded || e.props.isErrored || tool === undefined) return next(e)
    const first = outputText(e.props.output).split('\n').find(l => l.trim() !== '') ?? ''
    const { Box, Text } = $.ui.resolve(e)
    if (first === '') return <Box />
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 6)
    return (
      <Box paddingLeft={2}>
        <Text dimColor>{truncate(first, width)}</Text>
      </Box>
    )
  })

  // While working: the Divine Comedy.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const word = pick(words(lang).working, e.props.word)
    return next({ ...e, props: { ...e.props, word } })
  })

  // 🔥 Served in 31s ─────
  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    const w = words(lang)
    const word = pick(w.served, e.props.word)
    if (e.surface !== 'terminal' || e.props.isExpanded || e.props.waitingFor !== undefined) {
      return next({ ...e, props: { ...e.props, word } })
    }
    const { Text } = $.ui.resolve(e)
    const label = `🔥 ${word} ${w.in} ${formatDuration(e.props.durationMs)} `
    const rule = '─'.repeat(Math.max(0, Math.min(e.viewport?.columns ?? 60, 60) - label.length - 1))
    return (
      <Text>
        <Text color={EMBER}>{label}</Text>
        <Text dimColor>{rule}</Text>
      </Text>
    )
  })

  // The circles: ◉ ◉ ◎ ○ ○  Third circle: cache · Example Show S03E06 · 12s
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const journey = await read($, journeyAtom)
    await read($, tickAtom) // redraw each second while running
    if (journey === null) return next(e)
    const transfers = (await read($, transfersAtom)).filter(t => !t.ready).slice(-2)
    const now = await $.clock.now()
    if (journey.endedAt !== null && now - journey.endedAt > 120_000 && transfers.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const w = words(lang)
    const { reached, status } = journey
    const { lit, now: at } = marks()
    const letters = STEPS.map((_, i) => {
      const letter = 'DANTE'.charAt(i)
      if (lit[i] === true) return { letter, color: GOLD, dim: false }
      if (at === i) return { letter, color: EMBER, dim: false }
      return { letter, color: undefined, dim: true }
    })
    const elapsed = formatDuration((journey.endedAt ?? now) - journey.startedAt)
    const width = Math.max(20, e.props.bodyColumns - 20)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {letters.map((m, i) => (
            <Text key={`c${i}`} bold={!m.dim} color={m.color} dimColor={m.dim}>
              {m.letter}{' '}
            </Text>
          ))}
          <Text color={status === 'failed' ? EMBER : GOLD}>
            {' '}
            {target().isDone ? w.stars : w.circle(Math.max(0, Math.floor(target().depth)))}
          </Text>
          <Text dimColor> · {w.steps[STEPS[reached] ?? 'title'].toLowerCase()}</Text>
          {journey.title === '' ? null : <Text dimColor> · {truncate(journey.title, width)}</Text>}
          <Text dimColor> · {elapsed}</Text>
        </Box>
        {transfers.map(t => (
          <Box key={`${t.service}${t.id}`} flexDirection="row">
            <Text color={EMBER}>  ⇣ </Text>
            <Text dimColor>
              {truncate(t.name, width)} · {t.service} · {t.status}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
