#!/usr/bin/env node
// The status line command while Dante's header is pinned. Claude Code pipes it the JSON it gives any
// status line; this leaves the figures in $DANTE_RUN/status.json for the mod, which draws them in
// the header, and prints nothing, so the row under the prompt stays empty.
//
// Every figure is Claude Code's own; "left" is 100 minus its used percentage.
import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface Limit {
  used_percentage?: number
  /** Seconds since 1970. */
  resets_at?: number
}

interface Payload {
  cwd?: string
  workspace?: { current_dir?: string }
  model?: { display_name?: string }
  effort?: { level?: string }
  fast_mode?: boolean
  agent?: { name?: string }
  context_window?: { context_window_size?: number; total_input_tokens?: number }
  cost?: { total_cost_usd?: number; total_lines_added?: number; total_lines_removed?: number }
  rate_limits?: { five_hour?: Limit; seven_day?: Limit }
}

const left = (used: number): number => Math.max(0, 100 - used)
const two = (n: number): string => String(n).padStart(2, '0')

function limit(one: Limit | undefined) {
  if (typeof one?.used_percentage !== 'number') return null
  const at = typeof one.resets_at === 'number' ? new Date(one.resets_at * 1000) : null
  return {
    left: Math.round(left(one.used_percentage)),
    resets: at === null ? null : { weekday: at.getDay(), clock: `${two(at.getHours())}:${two(at.getMinutes())}` },
  }
}

function branchOf(cwd: string): string | null {
  if (cwd === '') return null
  try {
    const said = execFileSync('git', ['-C', cwd, '--no-optional-locks', 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    })
    return said.trim() || null
  } catch {
    // Not a git folder, no commit yet, or no git.
    return null
  }
}

function figures(input: Payload) {
  const cwd = input.cwd ?? input.workspace?.current_dir ?? ''
  const home = homedir()
  const window = input.context_window?.context_window_size ?? 0
  const tokens = input.context_window?.total_input_tokens ?? 0
  return {
    model: (input.model?.display_name ?? '').replace(' (1M context)', ' 1M'),
    effort: input.effort?.level ?? null,
    fast: input.fast_mode ?? false,
    agent: input.agent?.name ?? null,
    cwd: cwd === home || cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd,
    branch: branchOf(cwd),
    context: window > 0 ? { left: Math.floor(left((tokens * 100) / window)), tokens, window } : null,
    fiveHour: limit(input.rate_limits?.five_hour),
    sevenDay: limit(input.rate_limits?.seven_day),
    cost: input.cost?.total_cost_usd ?? 0,
    added: input.cost?.total_lines_added ?? 0,
    removed: input.cost?.total_lines_removed ?? 0,
  }
}

const run = process.env.DANTE_RUN
if (run) {
  try {
    const file = join(run, 'status.json')
    writeFileSync(`${file}.new`, JSON.stringify(figures(JSON.parse(readFileSync(0, 'utf8')) as Payload)))
    renameSync(`${file}.new`, file)
  } catch {
    // Nothing to read, or the session is over: the header keeps what it had.
  }
}
