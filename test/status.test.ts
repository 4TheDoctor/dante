import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gaugeOf, INK, levelColor, modelPieces, parseStatus, pathPieces, tilesOf, tilesThatFit, type Status } from '../plugin/hooks/status'
import { words } from '../plugin/hooks/words'
import { launchSettings } from '../src/launch.js'

const PAYLOAD = {
  cwd: join(homedir(), 'Dante'),
  model: { display_name: 'Opus 5.5 (1M context)' },
  effort: { level: 'max' },
  fast_mode: true,
  context_window: { context_window_size: 1_000_000, total_input_tokens: 98_231 },
  cost: { total_cost_usd: 0.4237, total_lines_added: 12, total_lines_removed: 3 },
  rate_limits: { five_hour: { used_percentage: 38.4, resets_at: 1_763_985_600 }, seven_day: { used_percentage: 69 } },
}

function feed(input: string, env: Record<string, string> = {}): { out: string; code: number | null; files: string[]; status: Status | null } {
  const run = mkdtempSync(join(tmpdir(), 'dante-feed-'))
  const { stdout, status: code } = spawnSync(process.execPath, ['dist/feed.js'], { input, encoding: 'utf8', env: { ...process.env, DANTE_RUN: run, ...env } })
  const files = readdirSync(run)
  const status = files.includes('status.json') ? parseStatus(readFileSync(join(run, 'status.json'), 'utf8')) : null
  rmSync(run, { recursive: true })
  return { out: stdout, code, files, status }
}

describe('the status line command', () => {
  it('prints nothing and leaves what is left of everything for the header', () => {
    const { out, code, files, status } = feed(JSON.stringify(PAYLOAD))
    expect([out, code, files]).toEqual(['', 0, ['status.json']])
    expect(status).toMatchObject({ model: 'Opus 5.5 1M', effort: 'max', fast: true, agent: null, cwd: '~/Dante', cost: 0.4237, added: 12, removed: 3 })
    expect(status?.context).toEqual({ left: 90, tokens: 98_231, window: 1_000_000 })
    expect(status?.fiveHour?.left).toBe(62)
    expect(status?.fiveHour?.resets?.clock).toMatch(/^\d\d:\d\d$/)
    expect(status?.sevenDay).toEqual({ left: 31, resets: null })
  })

  it('says nothing about what Claude Code did not say', () => {
    const { status } = feed('{}')
    expect(status).toMatchObject({ model: '', context: null, fiveHour: null, sevenDay: null, cost: 0 })
  })

  it('is quiet with nothing to read or nowhere to write', () => {
    expect(feed('not json')).toMatchObject({ out: '', code: 0, files: [] })
    expect(feed(JSON.stringify(PAYLOAD), { DANTE_RUN: '' })).toMatchObject({ out: '', code: 0, files: [] })
  })
})

describe('the figures in the header', () => {
  const status = feed(JSON.stringify(PAYLOAD)).status!
  const texts = (lang: 'en' | 'es', one: Status = status): string[] =>
    tilesOf(one, words(lang)).map(tile => [tile.label, tile.value.text, tile.detail.map(piece => piece.text).join('')].join(' | '))

  it('are named in plain words, with what each is out of', () => {
    const at = status.fiveHour!.resets!.clock
    expect(texts('en')).toEqual([
      'CHAT MEMORY | 90% left | 98k of 1M tokens used',
      `5-HOUR LIMIT | 62% left | refills at ${at}`,
      '7-DAY LIMIT | 31% left | refill time not known',
      'ESTIMATED COST | $0.42 | lines +12 −3',
    ])
    expect(texts('es')).toEqual([
      'MEMORIA DEL CHAT | 90 % libre | 98k de 1M tokens usados',
      `LÍMITE DE 5 HORAS | 62 % libre | se recarga a las ${at}`,
      'LÍMITE DE 7 DÍAS | 31 % libre | no se sabe cuándo se recarga',
      'COSTE ESTIMADO | $0.42 | líneas +12 −3',
    ])
  })

  it('name the day when the limit is days away', () => {
    const later = { ...status, sevenDay: { left: 31, resets: { weekday: 1, clock: '09:05' } } }
    expect(texts('es', later)[2]).toBe('LÍMITE DE 7 DÍAS | 31 % libre | se recarga el lun 09:05')
    expect(texts('en', later)[2]).toBe('7-DAY LIMIT | 31% left | refills Mon 09:05')
  })

  it('are a dash until the first answer', () => {
    const before = feed('{}').status!
    expect(texts('es', before).slice(0, 3)).toEqual(['MEMORIA DEL CHAT', 'LÍMITE DE 5 HORAS', 'LÍMITE DE 7 DÍAS'].map(label => `${label} | — | tras la primera respuesta`))
    expect(texts('es', before)[3]).toBe('COSTE ESTIMADO | $0.00 | de esta sesión')
  })

  it('keep the colours they had under the prompt', () => {
    expect([0, 9, 10, 45, 99, 100].map(levelColor)).toEqual(['#FF2D2D', '#FF2D2D', '#FF6B00', '#00FF00', '#FF4FD8', '#FF4FD8'])
    const gauge = gaugeOf(62, 20)
    expect(gauge.map(run => run.text).join('')).toBe('━'.repeat(12) + '─'.repeat(8))
    expect([gauge[0]!.color, gauge.at(-1)!.color]).toEqual(['#FF2D2D', INK.void])
    expect(gaugeOf(100, 10).map(run => run.text).join('')).toBe('━'.repeat(10))
    expect(modelPieces(status).map(piece => piece.text).join('')).toBe('Opus 5.5 1M · FAST · MAX')
    expect(modelPieces({ ...status, effort: 'high', fast: false }).map(piece => piece.text)).toEqual(['Opus 5.5 1M'])
    expect(pathPieces('~/Dante').map(piece => piece.text)).toEqual(['~/', 'Dante'])
  })

  it('drop from the end where they do not fit', () => {
    expect([60, 85, 112, 166, 400].map(columns => tilesThatFit(columns, 58, 27, 4))).toEqual([0, 1, 2, 4, 4])
  })

  it('do not take a broken file for figures', () => {
    expect(parseStatus('{"mod')).toBeNull()
    expect(parseStatus('[]')?.model).toBe('')
    expect(parseStatus('{"cost":"x","context":3,"fiveHour":{"left":"a"}}')).toMatchObject({ cost: 0, context: null, fiveHour: null })
  })
})

describe('what Claude Code is told', () => {
  it('moves the status line up only where the header stays put', () => {
    expect(launchSettings(false)).toEqual({ theme: 'custom:dante', verbose: false })
    const pinned = launchSettings(true)
    expect(pinned).toMatchObject({ theme: 'custom:dante', tui: 'fullscreen', statusLine: { type: 'command' } })
    const { command } = (pinned as { statusLine: { command: string } }).statusLine
    const run = mkdtempSync(join(tmpdir(), 'dante-feed-'))
    const ran = spawnSync('sh', ['-c', command], { input: JSON.stringify(PAYLOAD), encoding: 'utf8', env: { ...process.env, DANTE_RUN: run } })
    expect([ran.stdout, ran.stderr, readdirSync(run)]).toEqual(['', '', ['status.json']])
    rmSync(run, { recursive: true })
  })
})
