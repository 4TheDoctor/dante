// Pure helpers: no Claude Code imports, so the test suite can run them.
import type { TransferRow } from '../types'
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
  plan_dub: 'play',
  prepare_bdmv: 'play',
}

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
      rows.push({ service: m[1]!, id: m[2]!, name: m[5]!, ready: m[3] === 'ready', status: m[4] !== undefined ? `${m[4]}%` : m[3]! })
    }
    return rows
  }
  return []
}

