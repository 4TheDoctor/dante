import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Journey, TaskList, TransferRow } from '../types'
import { draw, drawRule, makeScene, toCells, type Scene } from './inferno'
import { danteTool, declaredSteps, downloadOf, factsFrom, isDub, outputText, parseTransfers, pitSize, readFrames, shortFacts, STEP_OF, targetOf, taskChange, titleOf } from './parse'
import { advance, isSettled, progressOf, type Motion, type Progress } from './progress'
import { DANTE, STEPS, words, type Lang } from './words'

// Dante's look for Claude Code ("Inferno"): the laurelled profile in the header, the five circles
// above the prompt, one quiet line per Dante tool, the Divine Comedy on the spinner. Every hook
// hands back to the engine when something is not as expected, so the worst case is the stock look.

const PLUGIN = 'dante'
const VERSION = '0.1.0'
const HEADER_ID = 'header'

// Stock Claude Code has no fixed slot at the top of the terminal, so the header is placed as a
// transcript row. A build that has one (DANTE_PINNED_HEADER=1) asks for a `Placed` drawing of this
// plugin's "header" under this requestId, HEADER_ROWS tall; it stays put while the chat scrolls.
const PINNED_REQUEST_ID = 'dante-header'
const HEADER_ROWS = 5
const PORTRAIT = { columns: 10, rows: 4 } as const

const EMBER = '#D9452B'
const GOLD = '#D4A24C'
const LAUREL = '#8FB65A'

// The circles of Hell, drawn beside the chat (inferno.ts) and repainted in place on this beat.
const PANE_ID = 'inferno'
const PANE_COLUMNS = 46
const CAPTION_ROWS = 8
/** The widest a Raster may be. */
const RULE_COLUMNS = 512
const BEAT_MS = 100
/** With nothing happening for this long, the picture stands still. */
const REST_AFTER_S = 300

// Literals on purpose: Claude Code scans these references before running the module.
const journeyAtom = atom({ plugin: 'dante', key: 'journey' } as const, null, { shape: 'journey-2' })
const transfersAtom = atom({ plugin: 'dante', key: 'transfers' } as const, [], { shape: 'transfers-1' })
const tickAtom = atom({ plugin: 'dante', key: 'tick' } as const, 0)
const NO_TASKS: TaskList = { title: '', all: {} }
const tasksAtom = atom({ plugin: 'dante', key: 'tasks' } as const, NO_TASKS, { shape: 'tasks-2' })

type CallState = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }
const markOf = (call: CallState): { glyph: string; color: string } =>
  call.isRunning
    ? { glyph: '◌', color: GOLD }
    : call.isErrored || call.isInterrupted
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

This session runs inside Dante (Debrid Aggregator & Navigator Tracker Engine): Claude Code set up as a media concierge, opened in the user's Dante folder. Use the \`dante\` skill and the \`mcp__*dante__*\` tools for anything about finding, choosing, adding or playing films and series; CLAUDE.md in this folder holds the user's tastes. For any other request of three or more steps, declare them with Dante's \`progress\` tool and mark each one when it is really finished. In chat, speak as Dante: a calm, well-read guide who knows the way through a maze of releases and says plainly which one and why, in the user's language and in few words. No theatrics in tables, warnings or anything with numbers. Never print keys, addon config URLs or Keychain values.`,
} as const

type Header = { version: string; model: string; cwd: string }

// Where the terminal shows pictures, the circles are drawn at full resolution by a helper process
// (src/pit/daemon.ts): it writes each frame to a file and the terminal reads the file, so no pixel
// crosses the chat. Elsewhere, or if the helper does not start, block characters draw them.
type Frame = { file: string; format: 'png'; generation: number }
type Helper = {
  dir: string
  columns: number
  rows: number
  said: string
  frame: Frame | undefined
  refused: number
  /** The pane is up and still the picture is not taken: this terminal does not show it. */
  isUseless: boolean
  isOver: boolean
}
const REFUSED_MOST = 40

async function runHelper($: EngineInterface, helper: Helper, node: string, cell: string | undefined, first: string): Promise<void> {
  const { width, height, scale } = pitSize(helper.columns, helper.rows, cell)
  let pending = ''
  try {
    await $.fs.write(`${helper.dir}/state.json`, first)
    const stream = $.process.spawn({
      argv: [node, `${$.plugin.root}/../dist/pit/daemon.js`, `${helper.dir}/state.json`, `${helper.dir}/frames`, String(width), String(height), String(scale)],
    })
    for await (const piece of stream) {
      // Leaving the loop ends the process.
      if (helper.isOver) break
      if (piece.stream !== 'stdout') continue
      const heard = readFrames(pending, piece.text)
      pending = heard.rest
      if (heard.frame === undefined) continue
      const isFirst = helper.frame === undefined
      const frame: Frame = { ...heard.frame, format: 'png' }
      helper.frame = frame
      if (isFirst) {
        // From blocks to the picture.
        $.ui.invalidate('ui.render')
        continue
      }
      const painted = await $.ui.blit({ requestId: 'inferno', key: 'pit', source: frame })
      helper.refused = painted.deny === undefined ? 0 : helper.refused + 1
      if (helper.refused > REFUSED_MOST) {
        helper.isUseless = (await $.ui.panes()).some(pane => pane.id === 'inferno' && pane.isPlaced)
        break
      }
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

  // The picture. It follows mirrors of the stored values, so a beat costs no round trip.
  let journeyNow: Journey | null = null
  let tasksNow: TaskList = NO_TASKS
  let transfersNow: readonly TransferRow[] = []
  let isWorking = false
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
  // The size the pane wants pictures at, and since which beat.
  let wanted: { columns: number; rows: number; since: number } | undefined

  // The five letters and what is cut beside them: the steps of a film, or the share of any other request.
  const marks = (): { title: string; facts: string[]; lit: boolean[]; now: number } => {
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

  const helperState = (): string => {
    const to = target()
    return JSON.stringify({ depth: to.depth, mood: to.mood, isDone: to.isDone, pace: animation, labels: { circles: words(lang).circles, ...marks() } })
  }

  // What the helper needs this beat: to start, to be told something, or to stop.
  const tend = (): { start?: Helper; tell?: { file: string; text: string } } => {
    if (helper?.isOver === true) {
      // One that never drew anything will not: stay with the blocks.
      if (helper.frame === undefined || helper.isUseless) isPicture = false
      else if (helper.refused > REFUSED_MOST) wanted = undefined
      helper = undefined
    }
    if (!isPicture || wanted === undefined || helperHome === undefined) {
      if (helper !== undefined) helper.isOver = true
      return {}
    }
    if (helper === undefined) {
      helpers += 1
      helper = { dir: `${helperHome}/pit/${helpers}-${Math.random().toString(36).slice(2, 8)}`, columns: wanted.columns, rows: wanted.rows, said: helperState(), frame: undefined, refused: 0, isUseless: false, isOver: false }
      return { start: helper }
    }
    const isResized = helper.columns !== wanted.columns || helper.rows !== wanted.rows
    if (isResized) {
      // Once the pane has held its new size for half a second.
      if (beats - wanted.since > 5) {
        helper.isOver = true
        return { tell: { file: `${helper.dir}/state.json`, text: '{"stop":true}' } }
      }
      return {}
    }
    const say = helperState()
    if (say === helper.said) return {}
    helper.said = say
    return { tell: { file: `${helper.dir}/state.json`, text: say } }
  }

  const tally = () => {
    const all = Object.values(tasksNow.all)
    return { total: all.length, done: all.filter(one => one === 'done').length }
  }

  const target = (): Progress =>
    progressOf({ journey: journeyNow, tasks: tally(), download: downloadOf(transfersNow), isWorking })

  const pitCells = (): string | undefined =>
    pit === undefined
      ? undefined
      : toCells(draw(pit, { depth: motion.depth, mood: target().mood, t: seconds, stars: motion.stars }), pit.w, pit.h)

  const ruleCells = (columns: number): string => toCells(drawRule(columns, seconds, isWorking ? 1 : 0.12), columns, 2)

  // One beat: move the picture on, and say what needs repainting.
  const beat = (): { pit?: string; rule?: string } => {
    const to = target()
    const isBusy = isWorking || !isSettled(motion, to)
    beats += 1
    seconds += BEAT_MS / 1000
    restless = isBusy ? 0 : restless + BEAT_MS / 1000
    motion = advance(motion, to, BEAT_MS / 1000)
    const pace = animation === 'off' ? 0 : isBusy ? (animation === 'calm' ? 2 : 1) : animation === 'calm' || restless > REST_AFTER_S ? 0 : 3
    const isDue = pace !== 0 && beats % pace === 0
    // The rule burns while Dante works, and one last cold repaint puts it out.
    const isRuleDue = ruleColumns > 0 && animation !== 'off' && (isWorking ? isDue : isRuleHot)
    isRuleHot = isWorking
    return {
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
    transfersNow = await read($, transfersAtom)
    motion = { depth: target().depth, stars: target().isDone ? 1 : 0 }

    await $.command.register({ name: 'inferno', description: words(lang).paneHelp })
    if ((await $.store.get('pane')) !== 'closed') {
      void $.ui.open({ id: PANE_ID, title: 'Inferno', columns: PANE_COLUMNS }).catch(() => undefined)
    }
    if (isPicture) helperHome = await $.process.hookEnv().then(env => env.CLAUDE_PLUGIN_DATA, () => undefined)
    beatTimer?.cancel()
    if (animation !== 'off' || isPicture) {
      beatTimer = $.clock.every(BEAT_MS, () => {
        const due = beat()
        const { start, tell } = tend()
        if (start !== undefined) void runHelper($, start, node, cell, start.said)
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
    return { sections: [...result.sections.filter(section => section.id !== VOICE.id), VOICE] }
  })

  on('command.run', { command: 'inferno' }, async $ => {
    const isUp = (await $.ui.panes()).some(one => one.id === PANE_ID && one.isPlaced)
    if (isUp) {
      await $.ui.close({ id: PANE_ID })
      await $.store.set('pane', 'closed')
      isPitUp = false
      wanted = undefined
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
    if (e.origin.kind === 'person') await $.store.set('pane', 'closed')
    return next(e)
  })

  // A new request: what was finished (or failed) is put away.
  on('prompt.submit', async ($, e, next) => {
    journeyNow = await update($, journeyAtom, j => (j !== null && j.endedAt !== null ? null : j))
    const { total, done } = tally()
    if (total > 0 && done === total) tasksNow = await update($, tasksAtom, () => NO_TASKS)
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) isWorking = true
    return next(e)
  })

  // The journey: which step the current request is in. Other requests: their task list.
  on('tool.call', async ($, e, next) => {
    const isDubbing = e.tool === 'Bash' && isDub(e.tool, e.command)
    const tool = isDubbing ? 'audio4films' : danteTool(e.tool)
    const step = tool === undefined ? undefined : STEP_OF[tool]

    if (tool === undefined) {
      const ran = await next(e)
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

    if (step !== undefined) {
      const reached = STEPS.indexOf(step)
      const now = await $.clock.now()
      const title = titleOf(tool, e)
      journeyNow = await update($, journeyAtom, j => {
        const isFresh = j === null || j.endedAt !== null || tool === 'find_title'
        const base: Journey = isFresh ? { title: title ?? '', reached, status: 'running', startedAt: now, endedAt: null, did: [], facts: {} } : j
        return { ...base, title: title ?? base.title, reached, status: 'running', endedAt: null }
      })
      if (stopTicking === undefined) {
        const timer = $.clock.every(1000, () => void update($, tickAtom, t => (t ?? 0) + 1))
        stopTicking = () => timer.cancel()
      }
    }

    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true

    // Steps Claude declares for a request that is not about a film.
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
      const status: Journey['status'] = hasFailed ? 'failed' : 'done'
      const found = hasFailed ? {} : factsFrom(tool, e, outputText(ran.result ?? ran.text))
      journeyNow = await update($, journeyAtom, j =>
        j === null || j.reached !== reached
          ? j
          : {
              ...j,
              status,
              endedAt: step === 'play' || hasFailed ? now : null,
              did: hasFailed || j.did.includes(step) ? j.did : [...j.did, step],
              facts: { ...j.facts, ...found },
            },
      )
      if (step === 'play' || hasFailed) {
        stopTicking?.()
        stopTicking = undefined
      }
    }

    if (!hasFailed && ran.deny === undefined) {
      const rows = parseTransfers(tool, outputText(ran.result ?? ran.text))
      if (rows.length && step === undefined) {
        // How the download goes: no step of its own, but the request's own number.
        const found = factsFrom(tool, e, outputText(ran.result ?? ran.text))
        journeyNow = await update($, journeyAtom, j => (j === null ? j : { ...j, facts: { ...j.facts, ...found } }))
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
      stopTicking?.()
      stopTicking = undefined
    }
    return next(e)
  })

  // Header: laurelled Dante beside name, version, model and folder.
  on('ui.render', { component: 'Placed' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.id !== HEADER_ID || header === null || e.surface !== 'terminal') {
      return next(e)
    }
    const { Box, Image, Raster, Text } = $.ui.resolve(e)
    const identity = (
      <Box flexDirection="row" height={PORTRAIT.rows}>
        <Image
          source={{ file: `${$.plugin.root}/art/dante.png`, format: 'png' }}
          columns={PORTRAIT.columns}
          rows={PORTRAIT.rows}
          alt="Dante"
        />
        <Box flexDirection="column" justifyContent="center" paddingLeft={2}>
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
          <Text dimColor>
            {header.model} · Claude Code {header.version}
          </Text>
          <Text dimColor>{header.cwd}</Text>
        </Box>
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
    // The slot is as wide as the terminal, but with a pane docked the viewport is the chat's: draw
    // the rule at its widest and let the slot cut it.
    const width = RULE_COLUMNS
    ruleColumns = width
    return (
      <Box flexDirection="column" height={HEADER_ROWS} overflow="hidden">
        {identity}
        <Raster key="rule" columns={width} rows={1} cells={ruleCells(width)} />
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
    const { Box, Image, Raster, Text } = $.ui.resolve(e)
    const w = words(lang)
    const to = target()

    const columns = Math.min(72, e.props.bodyColumns)
    const rows = Math.min(64, e.props.scroll.bodyRows - CAPTION_ROWS)
    const fits = columns >= 24 && rows >= 22
    if (!fits) pit = undefined
    else if (pit === undefined || pit.w !== columns || pit.h !== rows * 2) pit = makeScene(columns, rows * 2)
    if (!fits) wanted = undefined
    else if (wanted === undefined || wanted.columns !== columns || wanted.rows !== rows) wanted = { columns, rows, since: beats }
    const picture = isPicture && fits && helper?.columns === columns && helper.rows === rows ? helper.frame : undefined
    const cells = picture === undefined ? pitCells() : undefined
    isPitUp = cells !== undefined
    if (animation === 'off') motion = { depth: to.depth, stars: to.isDone ? 1 : 0 }

    const { total, done } = tally()
    const isIdle = journey === null && total === 0
    const heading = to.isDone ? w.stars : isIdle ? (isWorking ? w.gate : w.verseStart) : w.circle(Math.max(0, Math.floor(to.depth)))
    const foot = to.isDone
      ? w.verseEnd
      : journey !== null
        ? formatDuration((journey.endedAt ?? now) - journey.startedAt)
        : total > 0
          ? [w.tasks(done, total), tasksNow.title].filter(Boolean).join(' · ')
          : ''
    const { lit, now: at } = marks()
    const found = journey === null ? [] : w.found(journey.facts, journey.title)
    const room = Math.max(8, columns - 14)
    return (
      <Box flexDirection="column">
        {picture === undefined ? null : <Image key="pit" source={picture} columns={columns} rows={rows} alt="Inferno" />}
        {cells === undefined ? null : <Raster key="pit" columns={columns} rows={rows} cells={cells} />}
        <Box marginTop={1} flexDirection="column">
          <Text bold={!isIdle} color={journey?.status === 'failed' ? EMBER : GOLD}>
            {truncate(heading, columns)}
          </Text>
          {STEPS.map((step, i) => {
            const isLit = lit[i] === true
            const isNow = at === i
            return (
              <Box key={step} flexDirection="row">
                <Text bold={isLit || isNow} color={isLit ? GOLD : isNow ? EMBER : undefined} dimColor={!isLit && !isNow}>
                  {'DANTE'.charAt(i)}{'  '}
                </Text>
                {journey === null ? (
                  <Text dimColor={!isLit}>{DANTE[i]}</Text>
                ) : (
                  <Text dimColor={!isLit && !isNow}>
                    {w.steps[step].padEnd(11)}
                    {truncate(found[i] ?? '', room)}
                  </Text>
                )}
              </Box>
            )
          })}
          <Text dimColor>{truncate(foot, columns)}</Text>
        </Box>
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
    const mark = markOf(e.props)
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
          const mark = markOf(call)
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
