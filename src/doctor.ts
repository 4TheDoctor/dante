import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { configPath, danteHome } from './config.js'
import { findClaude } from './launch.js'
import { availablePlayers } from './play.js'
import type { Dante } from './service.js'

const run = promisify(execFile)

/** The Claude Code release the Inferno mod was last checked against. */
export const TESTED_CLAUDE = '2.1.330'

async function version(command: string, args = ['--version']): Promise<string | undefined> {
  try {
    const { stdout } = await run(command, args, { timeout: 10_000 })
    return stdout.trim().split('\n')[0]
  } catch {
    return undefined
  }
}

/** A plain report: one line per check, OK / WARN / FAIL first, so failures are easy to spot. */
export async function runDoctor(dante: Dante): Promise<string> {
  const lines: string[] = []
  const ok = (t: string) => lines.push(`OK    ${t}`)
  const warn = (t: string) => lines.push(`WARN  ${t}`)
  const bad = (t: string) => lines.push(`FAIL  ${t}`)

  ok(`Node ${process.version}`)
  const claude = findClaude()
  if (!claude) bad('Claude Code not found (install it from claude.com/claude-code)')
  else {
    const v = await version(claude)
    const n = /(\d+\.\d+\.\d+)/.exec(v ?? '')?.[1]
    if (n === TESTED_CLAUDE) ok(`Claude Code ${n}`)
    else warn(`Claude Code ${n ?? '?'}; the Inferno look was checked on ${TESTED_CLAUDE}, so parts may draw in the stock style`)
  }

  const home = danteHome()
  if (existsSync(configPath(home))) ok(`config ${configPath(home)}`)
  else warn(`no ${configPath(home)} yet: run \`dante setup\``)

  const engines = await dante.engines()
  if (!dante.config.engines.length) bad('no engine configured')
  else if (engines.length < dante.config.engines.length) warn(`${dante.config.engines.length - engines.length} engine(s) skipped: their secret is missing`)
  for (const e of engines) {
    try {
      ok(`${e.describe()}: ${await e.ping()}`)
    } catch (err) {
      bad(`${e.describe()}: ${(err as Error).message}`)
    }
  }

  const debrids = await dante.debrids()
  if (!debrids.length) warn('no debrid service configured (engines that resolve links themselves still work)')
  for (const d of debrids) {
    try {
      const a = await d.account()
      if (a.premium) ok(`${d.service}: premium${a.expires ? ` until ${a.expires}` : ''}`)
      else warn(`${d.service}: the account is not premium`)
    } catch (err) {
      bad(`${d.service}: ${(err as Error).message}`)
    }
  }

  const players = await availablePlayers()
  if (players.length) ok(`players: ${players.join(', ')}`)
  else warn('no local player (IINA, VLC, mpv); Stremio still works')

  const a4f = await version('audio4films')
  if (a4f) ok(`${a4f} (dubs onto better video)`)
  else warn('audio4films not installed: plan_dub needs it (github.com/4TheDoctor/audio4films)')

  return lines.join('\n')
}
