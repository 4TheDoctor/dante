import { describe, expect, it } from 'vitest'
import { INSTALL, offerAudio4films, SOURCE } from '../src/audio4films.js'

/** A computer with these commands, and what the offer asked, ran and said on it. */
async function offer(has: string[], answer: boolean, install: 'works' | 'fails' | 'out of PATH' = 'works') {
  const commands = new Set(has)
  const asked: [string, boolean][] = []
  const ran: string[] = []
  let said = ''
  await offerAudio4films({
    yes: async (question, fallback) => (asked.push([question, fallback]), answer),
    write: text => void (said += text),
    version: async command => (commands.has(command) ? `${command} 1.0` : undefined),
    install: async (command, args) => {
      ran.push([command, ...args].join(' '))
      if (install === 'works') commands.add('audio4films')
      return install !== 'fails'
    },
  })
  return { asked, ran, said }
}

describe('offering audio4films in setup', () => {
  it('asks, with no as the answer to Enter, and installs nothing on a no', async () => {
    const { asked, ran, said } = await offer(['uv', 'ffmpeg'], false)
    expect(asked).toEqual([['Install audio4films', false]])
    expect(ran).toEqual([])
    expect(said).toContain(INSTALL)
  })

  it('installs with uv, or with pipx where there is no uv', async () => {
    expect((await offer(['uv', 'pipx', 'ffmpeg'], true)).ran).toEqual([`uv tool install ${SOURCE}`])
    expect((await offer(['pipx', 'ffmpeg'], true)).ran).toEqual([`pipx install ${SOURCE}`])
  })

  it('does not ask when it is there already', async () => {
    const { asked, ran, said } = await offer(['audio4films', 'ffmpeg'], true)
    expect([asked, ran]).toEqual([[], []])
    expect(said).toContain('Found audio4films 1.0')
  })

  it('says what is missing instead of failing', async () => {
    expect((await offer([], true)).said).toContain('It needs uv')
    expect((await offer(['uv'], true)).said).toContain('FFmpeg')
    expect((await offer(['uv', 'ffmpeg'], true, 'fails')).said).toContain('Dante works without it')
    expect((await offer(['uv', 'ffmpeg'], true, 'out of PATH')).said).toContain('uv tool update-shell')
  })
})
