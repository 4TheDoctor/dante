import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Journey } from '../types'
import { danteTool, outputText, parseTransfers, STEP_OF, targetOf, titleOf } from './parse'
import { STEPS, words, type Lang } from './words'

// Dante's look for Claude Code ("Inferno"): the laurelled profile in the header, the five circles
// above the prompt, one quiet line per Dante tool, the Divine Comedy on the spinner. Every hook
// hands back to the engine when something is not as expected, so the worst case is the stock look.

const PLUGIN = 'dante'
const VERSION = '0.1.0'
const HEADER_ID = 'header'

const EMBER = '#D9452B'
const GOLD = '#D4A24C'
const LAUREL = '#8FB65A'

// Literals on purpose: Claude Code scans these references before running the module.
const journeyAtom = atom({ plugin: 'dante', key: 'journey' } as const, null, { shape: 'journey-1' })
const transfersAtom = atom({ plugin: 'dante', key: 'transfers' } as const, [], { shape: 'transfers-1' })
const tickAtom = atom({ plugin: 'dante', key: 'tick' } as const, 0)

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

This session runs inside Dante: Claude Code set up as a media concierge, opened in the user's Dante folder. Use the \`dante\` skill and the \`mcp__*dante__*\` tools for anything about finding, choosing, adding or playing films and series; CLAUDE.md in this folder holds the user's tastes. In chat, speak as Dante: a calm, well-read guide who knows the way through a maze of releases and says plainly which one and why, in the user's language and in few words. No theatrics in tables, warnings or anything with numbers. Never print keys, addon config URLs or Keychain values.`,
} as const

type Header = { version: string; model: string; cwd: string }

export const register: Register = on => {
  let header: Header | null = null
  let lang: Lang = 'en'
  let stopTicking: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const wanted = await $.env.get('DANTE_UI_LANG')
    lang = wanted === 'es' ? 'es' : 'en'

    if (!e.isInteractive) return result

    const [version, model, home] = await Promise.all([$.session.version(), $.session.model(), $.env.get('HOME')])
    const cwd = home && e.cwd.startsWith(home) ? `~${e.cwd.slice(home.length)}` : e.cwd
    header = { version: version.base ?? version.version, model: displayModel(model), cwd }
    await $.ui.place({ id: HEADER_ID })
    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    return { sections: [...result.sections.filter(section => section.id !== VOICE.id), VOICE] }
  })

  // The journey: which circle the current request is in.
  on('tool.call', async ($, e, next) => {
    const tool = danteTool(e.tool)
    const step = tool === undefined ? undefined : STEP_OF[tool]
    if (tool === undefined) return next(e)

    if (step !== undefined) {
      const reached = STEPS.indexOf(step)
      const now = await $.clock.now()
      const title = titleOf(tool, e)
      await update($, journeyAtom, j => {
        const fresh = j === null || j.endedAt !== null || tool === 'find_title' || (tool === 'search_streams' && j.reached >= 1)
        const base: Journey = fresh
          ? { title: title ?? '', reached, status: 'running', startedAt: now, endedAt: null }
          : { ...j, reached, status: 'running' }
        return { ...base, title: title ?? base.title, reached: Math.max(reached, fresh ? 0 : base.reached) }
      })
      if (stopTicking === undefined) {
        const timer = $.clock.every(1000, () => void update($, tickAtom, t => (t ?? 0) + 1))
        stopTicking = () => timer.cancel()
      }
    }

    const ran = await next(e)
    const failed = ran.deny !== undefined || ran.isError === true
    const text = ran.deny === undefined ? outputText(ran.result ?? ran.text) : ''

    if (step !== undefined) {
      const now = await $.clock.now()
      const reached = STEPS.indexOf(step)
      const status: Journey['status'] = failed ? 'failed' : 'done'
      await update($, journeyAtom, j =>
        j === null || j.reached !== reached ? j : { ...j, status, endedAt: step === 'play' || failed ? now : null },
      )
      if (step === 'play' || failed) {
        stopTicking?.()
        stopTicking = undefined
      }
    }

    if (!failed) {
      const rows = parseTransfers(tool, text)
      if (rows.length) {
        await update($, transfersAtom, list => {
          const kept = list.filter(r => !rows.some(n => n.service === r.service && n.id === r.id))
          return [...kept, ...rows].slice(-5)
        })
      }
    }
    return ran
  })

  // A new message from the person starts the next journey fresh on the next search.
  on('turn.complete', async ($, e, next) => {
    stopTicking?.()
    stopTicking = undefined
    return next(e)
  })

  // Header: laurelled Dante beside name, version, model and folder.
  on('ui.render', { component: 'Placed' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.id !== HEADER_ID || header === null || e.surface !== 'terminal') {
      return next(e)
    }
    const { Box, Image, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" paddingY={1}>
        <Image source={{ file: `${$.plugin.root}/art/dante.png`, format: 'png' }} columns={10} rows={4} alt="Dante" />
        <Box flexDirection="column" paddingLeft={2}>
          <Text>
            <Text bold color={EMBER}>
              DANTE
            </Text>
            <Text dimColor> v{VERSION}</Text>
          </Text>
          <Text dimColor>{header.model}</Text>
          <Text dimColor>
            Claude Code {header.version} · {header.cwd}
          </Text>
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
    const marks = STEPS.map((step, i) => {
      if (i < reached) return { glyph: '◉', color: GOLD, dim: false }
      if (i > reached) return { glyph: '○', color: undefined, dim: true }
      if (status === 'failed') return { glyph: '✗', color: EMBER, dim: false }
      return status === 'done' ? { glyph: '◉', color: GOLD, dim: false } : { glyph: '◎', color: EMBER, dim: false }
    })
    const elapsed = formatDuration((journey.endedAt ?? now) - journey.startedAt)
    const width = Math.max(20, e.props.bodyColumns - 20)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {marks.map((m, i) => (
            <Text key={`c${i}`} color={m.color} dimColor={m.dim}>
              {m.glyph}{' '}
            </Text>
          ))}
          <Text color={status === 'failed' ? EMBER : GOLD}> {w.circle(reached, w.steps[STEPS[reached] ?? 'title'])}</Text>
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
