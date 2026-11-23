// Pure helpers: no Claude Code imports, so the test suite can run them.
import type { Facts, TaskList, TransferRow } from '../types'
import { words, type Lang, type StepId } from './words'

/** Tools Dante's MCP server adds, whatever prefix Claude Code gives them. */
export const DANTE_TOOL = /^mcp__(?:plugin_)?(?:dante_)?dante__(.+)$/
export const danteTool = (tool: string): string | undefined => DANTE_TOOL.exec(tool)?.[1]

/** Which circle each tool stands in. Tools not listed (status, doctor) do not move the journey. */
export const STEP_OF: Record<string, StepId> = {
  find_title: 'title',
  search_streams: 'search',
  check_cache: 'cache',
  add_to_debrid: 'add',
  get_links: 'add',
  play: 'play',
  plan_dub: 'add',
  prepare_bdmv: 'play',
  // Not a tool of Dante's: the dub itself, run with Bash.
  audio4films: 'play',
}

/** The dub runs outside Dante's tools: the command plan_dub hands over. */
export const isDub = (tool: string, command: unknown): boolean =>
  tool === 'Bash' && typeof command === 'string' && /(^|[\s;&|])audio4films\s+run\b/.test(command)

type Fields = Record<string, unknown>
const fieldsOf = (input: unknown): Fields => (typeof input === 'object' && input !== null ? (input as Fields) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** "Example Show S03E06" from a search_streams call; the query from find_title. */
export function titleOf(tool: string, input: unknown): string | undefined {
  const f = fieldsOf(input)
  if (tool === 'search_streams') {
    const title = str(f.title)
    if (title === undefined) return undefined
    const season = num(f.season)
    const episode = num(f.episode)
    return season === undefined ? title : `${title} S${pad2(season)}${episode === undefined ? '' : `E${pad2(episode)}`}`
  }
  if (tool === 'find_title') return str(f.query)
  return undefined
}

/** What a Dante tool is working on, for its row. */
export function targetOf(tool: string, input: unknown, lang: Lang = 'en'): string {
  const f = fieldsOf(input)
  const title = titleOf(tool, input)
  if (title !== undefined) return title
  switch (tool) {
    case 'check_cache':
      return Array.isArray(f.ids) ? words(lang).results(f.ids.length, str(f.service)) : ''
    case 'add_to_debrid':
    case 'get_links':
    case 'play':
      return [str(f.id), str(f.player), str(f.service)].filter(Boolean).join(' · ')
    case 'plan_dub':
      return [str(f.video_id), str(f.audio_id)].filter(Boolean).join(' + ')
    case 'prepare_bdmv':
      return str(f.source_path) ?? ''
    case 'progress':
      return [str(f.title), words(lang).tasks(num(f.done) ?? 0, num(f.total) ?? 0)].filter(Boolean).join(' · ')
    default:
      return str(f.service) ?? ''
  }
}

/** Text of an MCP result, whatever shape it arrives in. */
export function outputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.map(outputText).filter(Boolean).join('\n')
  if (typeof output === 'object' && output !== null) {
    const o = output as Fields
    if (typeof o.text === 'string') return o.text
    if (o.content !== undefined) return outputText(o.content)
    if (o.result !== undefined) return outputText(o.result)
  }
  return ''
}

/** "Added to alldebrid (transfer 12): Name. Status: Queued." -> a transfer row. */
export function parseTransfers(tool: string, text: string): TransferRow[] {
  if (tool === 'add_to_debrid') {
    const m = /^Added to (\w+) \(transfer ([^)]+)\): (.*?)\. (?:(Ready to play)|Status: (.*?))\.?$/m.exec(text)
    if (m === null) return []
    const ready = m[4] !== undefined
    return [{ service: m[1]!, id: m[2]!, name: m[3]!, ready, status: ready ? 'ready' : (m[5] ?? '') }]
  }
  if (tool === 'debrid_status') {
    const rows: TransferRow[] = []
    for (const line of text.split('\n')) {
      const m = /^(\w+) (\S+)  (ready|[^ ].*?)(?: (\d+)%)?  (.+)$/.exec(line.trim())
      if (m === null) continue
      rows.push({ service: m[1]!, id: m[2]!, name: m[5]!, ready: m[3] === 'ready', status: m[4] !== undefined && !BROKEN.test(m[3]!) ? `${m[4]}%` : m[3]! })
    }
    return rows
  }
  return []
}


/** What AllDebrid, Real-Debrid and TorBox say of a download that will not finish. */
const BROKEN = /error|fail|dead|virus|infring|expired|too big|deleted|no peer|not downloaded|missing|took more than/i
export const isBroken = (row: TransferRow): boolean => !row.ready && BROKEN.test(row.status)

/** What a search says of the engines that did not answer. */
export const enginesThatFailed = (text: string): string => /^Engines that failed: (.+)$/m.exec(text)?.[1] ?? ''

/** Someone said no: the request stops, but nothing is wrong. */
export const isRefusal = (text: string): boolean => /doesn't want to (?:proceed|take this action)|tool use was rejected|permission to use .* (?:has been )?denied/i.test(text)

const SHUT_OUT = /\b(?:401|403|451)\b|unauthor|forbidden|api ?key|\bauth|\btoken\b|premium|infring|blocked|banned|cloudflare|captcha/i

/** The circle (0 to 8) a failed tool breaks. A search with nothing in it breaks no engine. */
export function faultAt(tool: string, text: string, isEmpty: boolean): number {
  switch (tool) {
    case 'find_title':
      return 0
    case 'search_streams':
      if (isEmpty && !/^Engines that failed:/m.test(text)) return 3
      return /jackett|prowlarr|torznab|tracker/i.test(text) ? 2 : 1
    case 'check_cache':
      return SHUT_OUT.test(text) ? 5 : 4
    case 'get_links':
      return 7
    case 'play':
    case 'prepare_bdmv':
    case 'audio4films':
      return 8
    default:
      return SHUT_OUT.test(text) ? 5 : 6
  }
}

/** "42%" in the newest unfinished transfer -> 0.42; null when no service reports one. */
export function downloadOf(rows: readonly TransferRow[]): number | null {
  const last = rows.filter(r => !r.ready).at(-1)
  const m = last === undefined ? null : /^(\d+)%$/.exec(last.status)
  return m === null ? null : Number(m[1]) / 100
}

/** The steps a `progress` call declares. */
export function declaredSteps(input: unknown): TaskList | undefined {
  const f = fieldsOf(input)
  const total = num(f.total)
  const done = num(f.done)
  if (total === undefined || done === undefined || total < 1) return undefined
  const all: TaskList['all'] = {}
  for (let i = 0; i < total; i++) all[`step${i}`] = i < done ? 'done' : 'open'
  return { title: str(f.title) ?? '', all }
}

/** Task list changes: task id -> open or done, or undefined when the call is not about tasks. */
export function taskChange(tool: string, input: unknown, result: unknown): { id: string; to: 'open' | 'done' | 'gone' } | undefined {
  const f = fieldsOf(input)
  if (tool === 'TaskCreate') {
    const task = fieldsOf(fieldsOf(result).task)
    const id = str(task.id)
    return id === undefined ? undefined : { id, to: 'open' }
  }
  if (tool === 'TaskUpdate') {
    const id = str(f.taskId)
    const status = str(f.status)
    if (id === undefined || status === undefined) return undefined
    return { id, to: status === 'completed' ? 'done' : status === 'deleted' ? 'gone' : 'open' }
  }
  return undefined
}

export const FRAME_KINDS = ['pit', 'rule', 'rule2'] as const
export type FrameKind = (typeof FRAME_KINDS)[number]

/** A frame the helper announces: `pit <absolute path> <number> <width>x<height>`, or `rule …`, or `rule2 …`. */
export type Announced = { kind: FrameKind; file: string; generation: number; width: number; height: number }

export type Heard = { rest: string } & { [kind in FrameKind]?: Announced }

/** The newest frame of each kind in what the helper wrote. Keeps what is not a whole line yet. */
export function readFrames(pending: string, text: string): Heard {
  const lines = (pending + text).split('\n')
  const heard: Heard = { rest: lines.pop() ?? '' }
  for (const line of lines) {
    const m = /^(pit|rule2?) (\/.+\.png) (\d+) (\d+)x(\d+)$/.exec(line)
    if (m === null) continue
    const kind = m[1] as FrameKind
    heard[kind] = { kind, file: m[2]!, generation: Number(m[3]), width: Number(m[4]), height: Number(m[5]) }
  }
  return heard
}

/** Why a tool failed, in its own words: one line, without addresses, keys or paths. */
export function reasonOf(text: string): string {
  const line = text.split('\n').find(one => one.trim() !== '') ?? ''
  return line
    .replace(/^\s*(?:error|tool error)\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/gi, '…')
    .replace(/(?:~|\/[\w.-]+)(?:\/[\w.-]+)+/g, '…')
    .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

/** The widest an `Image` may be, in cells: one more, and the whole header is refused. */
const IMAGE_MOST = 255
/** The widest rule: two pictures side by side. */
export const RULE_MOST = IMAGE_MOST * 2

/** How many cells wide each picture of a rule that long is. */
export function ruleParts(columns: number): number[] {
  const whole = Math.max(1, Math.min(RULE_MOST, Math.floor(columns)))
  return whole <= IMAGE_MOST ? [whole] : [IMAGE_MOST, whole - IMAGE_MOST]
}

/** The same for the burning rule, one row tall: finer, or a flame has no room to be one. */
export function ruleSize(columns: number, cell: string | undefined): { width: number; height: number; scale: number } {
  const { width, height } = pitSize(columns, 1, cell)
  return { width, height, scale: Math.max(1, Math.round(height / 18)) }
}

/** How big to draw the pit for a pane of that many cells, and how many screen pixels one of its own takes. */
export function pitSize(columns: number, rows: number, cell: string | undefined): { width: number; height: number; scale: number } {
  const m = /^(\d+)x(\d+)$/.exec(cell ?? '')
  const [w, h] = m === null ? [8, 16] : [Number(m[1]), Number(m[2])]
  return { width: columns * w, height: rows * h, scale: Math.max(1, Math.round(w / 3.5)) }
}

const SERVICES: Record<string, string> = { AD: 'AllDebrid', RD: 'Real-Debrid', TB: 'TorBox', PM: 'Premiumize', DL: 'Debrid-Link', OC: 'Offcloud', ED: 'EasyDebrid', PP: 'PikPak' }
const named = (service: string): string => Object.values(SERVICES).find(one => one.toLowerCase().replace(/-/g, '') === service.toLowerCase()) ?? service

/** What a finished tool found, read from its own words. Only what it says. */
export function factsFrom(tool: string, input: unknown, text: string): Facts {
  const f = fieldsOf(input)
  switch (tool) {
    case 'search_streams': {
      const results = /: (\d+) results? after ranking/.exec(text)
      const year = num(f.year)
      return { ...(results === null ? {} : { results: Number(results[1]) }), ...(year === undefined ? {} : { year }) }
    }
    case 'check_cache': {
      const lines = text.split('\n').filter(line => line.trim() !== '' && !line.startsWith('WARNING'))
      const hits = lines.filter(line => /\b[A-Z]{2} cached\b/.test(line))
      const service = /\b([A-Z]{2}) cached\b/.exec(hits[0] ?? '')?.[1]
      return { checked: lines.length, cached: hits.length, ...(service === undefined ? {} : { where: SERVICES[service] ?? service }) }
    }
    case 'add_to_debrid':
    case 'debrid_status': {
      const row = parseTransfers(tool, text).at(-1)
      if (row === undefined) return {}
      const percent = row.ready ? 100 : /^(\d+)%$/.exec(row.status)?.[1]
      return { where: named(row.service), ...(percent === undefined ? {} : { percent: Number(percent) }) }
    }
    case 'get_links': {
      const via = / · via (\S+)/.exec(text)?.[1]
      return via === undefined ? {} : { where: named(via), percent: 100 }
    }
    case 'play': {
      const player = /^Playing .* in (\w+)\.?$/m.exec(text)?.[1] ?? (/^In Stremio/.test(text) ? 'Stremio' : undefined)
      return player === undefined ? {} : { player }
    }
    case 'prepare_bdmv':
      return { player: 'Blu-ray' }
    case 'audio4films':
      return { player: 'audio4films' }
    default:
      return {}
  }
}

/** The facts as cut in the rock: one short word for each of the five steps. */
export const shortFacts = (facts: Facts): string[] => [
  facts.year === undefined ? '' : String(facts.year),
  facts.results === undefined ? '' : String(facts.results),
  facts.checked === undefined ? '' : `${facts.cached ?? 0}/${facts.checked}`,
  facts.percent === undefined ? '' : facts.percent >= 100 ? 'OK' : `${facts.percent}%`,
  facts.player ?? '',
]
