import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareBdmv } from '../src/bdmv.js'

function disc(): { source: string; library: string } {
  const root = mkdtempSync(join(tmpdir(), 'dante-bdmv-'))
  const source = join(root, 'mount', 'Film')
  for (const dir of ['STREAM', 'BDJO', 'PLAYLIST']) mkdirSync(join(source, 'BDMV', dir), { recursive: true })
  mkdirSync(join(source, 'CERTIFICATE'))
  writeFileSync(join(source, 'BDMV', 'index.bdmv'), 'index')
  writeFileSync(join(source, 'BDMV', 'BDJO', '00000.bdjo'), 'menu')
  writeFileSync(join(source, 'BDMV', 'STREAM', '00001.m2ts'), 'video')
  return { source, library: join(root, 'library') }
}

describe('prepareBdmv', () => {
  it('copies the menu files and links the video folder instead of copying it', () => {
    const { source, library } = disc()
    const out = prepareBdmv(source, library)
    expect(out.path).toBe(join(library, 'Film'))
    expect(readFileSync(join(out.path, 'BDMV', 'BDJO', '00000.bdjo'), 'utf8')).toBe('menu')
    expect(existsSync(join(out.path, 'CERTIFICATE'))).toBe(true)
    const stream = join(out.path, 'BDMV', 'STREAM')
    expect(lstatSync(stream).isSymbolicLink()).toBe(true)
    expect(readlinkSync(stream)).toBe(join(source, 'BDMV', 'STREAM'))
  })

  it('can run twice and never touches the source', () => {
    const { source, library } = disc()
    prepareBdmv(source, library)
    prepareBdmv(source, library)
    expect(readFileSync(join(source, 'BDMV', 'STREAM', '00001.m2ts'), 'utf8')).toBe('video')
  })

  it('refuses a folder that is not a Blu-ray disc', () => {
    expect(() => prepareBdmv(tmpdir(), tmpdir())).toThrow(/index\.bdmv is missing/)
  })
})
