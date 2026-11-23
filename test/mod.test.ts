import { describe, expect, it } from 'vitest'
import { danteTool, outputText, parseTransfers, targetOf, titleOf } from '../plugin/hooks/parse'
import { STEPS, words } from '../plugin/hooks/words'

describe('the Inferno mod reads Dante tool calls', () => {
  it('recognises Dante tools under any MCP prefix and nothing else', () => {
    expect(danteTool('mcp__plugin_dante_dante__search_streams')).toBe('search_streams')
    expect(danteTool('mcp__dante__play')).toBe('play')
    expect(danteTool('mcp__plugin_voicemode_voicemode__converse')).toBeUndefined()
    expect(danteTool('Bash')).toBeUndefined()
  })

  it('names what is being looked for', () => {
    expect(titleOf('search_streams', { title: 'Example Show', season: 3, episode: 6 })).toBe('Example Show S03E06')
    expect(titleOf('search_streams', { title: 'Dune: Part Two', year: 2024 })).toBe('Dune: Part Two')
    expect(titleOf('find_title', { query: 'dune 2' })).toBe('dune 2')
    expect(targetOf('check_cache', { ids: ['a', 'b'], service: 'alldebrid' }, 'es')).toBe('2 resultados en alldebrid')
    expect(targetOf('check_cache', { ids: ['a'] }, 'en')).toBe('1 result')
  })

  it('reads MCP results in the shapes Claude Code hands over', () => {
    expect(outputText('plain')).toBe('plain')
    expect(outputText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
    expect(outputText({ content: [{ type: 'text', text: 'c' }] })).toBe('c')
    expect(outputText(undefined)).toBe('')
  })

  it('turns add and status results into transfer rows', () => {
    expect(parseTransfers('add_to_debrid', 'Added to alldebrid (transfer 12): Dune.mkv. Status: Queued.')).toEqual([
      { service: 'alldebrid', id: '12', name: 'Dune.mkv', ready: false, status: 'Queued' },
    ])
    expect(parseTransfers('add_to_debrid', 'Added to torbox (transfer 9): Dune.mkv. Ready to play.')).toEqual([
      { service: 'torbox', id: '9', name: 'Dune.mkv', ready: true, status: 'ready' },
    ])
    expect(parseTransfers('debrid_status', 'alldebrid 12  Downloading 42%  Dune.mkv\nrealdebrid ABC  ready  Other.mkv')).toEqual([
      { service: 'alldebrid', id: '12', name: 'Dune.mkv', ready: false, status: '42%' },
      { service: 'realdebrid', id: 'ABC', name: 'Other.mkv', ready: true, status: 'ready' },
    ])
  })

  it('has the same circles and words in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const w = words(lang)
      expect(Object.keys(w.steps)).toEqual([...STEPS])
    }
  })
})
