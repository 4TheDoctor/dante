import { describe, expect, it } from 'vitest'
import { AllDebrid, flattenAdFiles } from '../src/debrid/alldebrid.js'
import { pickFile } from '../src/debrid/debrid.js'
import { RealDebrid } from '../src/debrid/realdebrid.js'
import { TorBox } from '../src/debrid/torbox.js'
import { mockFetch } from './helpers.js'

const H1 = 'a'.repeat(40)
const H2 = 'b'.repeat(40)

describe('AllDebrid', () => {
  it('checks the cache by uploading, then removes only what it added', async () => {
    const { fetch, calls } = mockFetch([
      ['POST', /\/v4\.1\/magnet\/status/, () => ({ json: { status: 'success', data: { magnets: [{ id: 7, hash: H2 }] } } })],
      ['POST', /\/v4\/magnet\/upload/, () => ({
        json: { status: 'success', data: { magnets: [{ id: 11, hash: H1, ready: true }, { id: 7, hash: H2, ready: false }] } },
      })],
      ['POST', /\/v4\/magnet\/delete/, () => ({ json: { status: 'success', data: { message: 'deleted' } } })],
    ])
    const ad = new AllDebrid('KEY', fetch)
    expect(await ad.checkCached([H1, H2])).toEqual({ [H1]: true, [H2]: false })
    const deletes = calls.filter(c => c.url.includes('/magnet/delete'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0]!.body).toBe('id=11')
    expect(calls.every(c => c.headers.authorization === 'Bearer KEY')).toBe(true)
    expect(calls.every(c => !c.url.includes('KEY'))).toBe(true)
  })

  it('flattens nested file trees and reports API errors with their code', async () => {
    expect(
      flattenAdFiles([{ n: 'Show S03', e: [{ n: 'E06.mkv', s: 5, l: 'https://alldebrid.com/f/x' }, { n: 'sample.mkv', s: 1, l: 'https://alldebrid.com/f/y' }] }]),
    ).toEqual([
      { name: 'Show S03/E06.mkv', size: 5, link: 'https://alldebrid.com/f/x' },
      { name: 'Show S03/sample.mkv', size: 1, link: 'https://alldebrid.com/f/y' },
    ])
    const { fetch } = mockFetch([
      ['POST', /\/v4\/link\/unlock/, () => ({ json: { status: 'error', error: { code: 'AUTH_BAD_APIKEY', message: 'The auth apikey is invalid' } } })],
    ])
    await expect(new AllDebrid('bad', fetch).unlock('x')).rejects.toThrow(/AUTH_BAD_APIKEY/)
  })
})

describe('Real-Debrid', () => {
  it('has no cache endpoint: adds, looks at the status, removes what it added', async () => {
    let n = 0
    const { fetch, calls } = mockFetch([
      ['GET', /\/torrents\?limit/, () => ({ json: [{ id: 'OLD', hash: H2.toUpperCase() }] })],
      ['POST', /\/torrents\/addMagnet/, () => ({ status: 201, json: { id: `T${++n}` } })],
      ['POST', /\/torrents\/selectFiles\//, () => ({ status: 204 })],
      ['GET', /\/torrents\/info\/T1/, () => ({ json: { id: 'T1', status: 'downloaded' } })],
      ['GET', /\/torrents\/info\/T2/, () => ({ json: { id: 'T2', status: 'magnet_conversion' } })],
      ['DELETE', /\/torrents\/delete\//, () => ({ status: 204 })],
    ])
    const rd = new RealDebrid('KEY', fetch)
    expect(await rd.checkCached([H1, H2])).toEqual({ [H1]: true, [H2]: false })
    const deleted = calls.filter(c => c.method === 'DELETE').map(c => c.url.split('/').pop())
    expect(deleted).toEqual(['T1'])
  })

  it('explains the copyright block instead of a bare error code', async () => {
    const { fetch } = mockFetch([
      ['POST', /\/unrestrict\/link/, () => ({ status: 451, json: { error: 'infringing_file', error_code: 35 } })],
    ])
    await expect(new RealDebrid('KEY', fetch).unlock('https://real-debrid.com/d/x')).rejects.toThrow(/copyright/)
  })

  it('pairs selected files with their links in order', async () => {
    const { fetch } = mockFetch([
      ['GET', /\/torrents\/info\/T9/, () => ({
        json: {
          id: 'T9',
          status: 'downloaded',
          files: [
            { id: 1, path: '/Show/E05.mkv', bytes: 10, selected: 0 },
            { id: 2, path: '/Show/E06.mkv', bytes: 20, selected: 1 },
            { id: 3, path: '/Show/E07.mkv', bytes: 30, selected: 1 },
          ],
          links: ['https://real-debrid.com/d/6', 'https://real-debrid.com/d/7'],
        },
      })],
    ])
    expect(await new RealDebrid('KEY', fetch).files('T9')).toEqual([
      { name: 'Show/E06.mkv', size: 20, link: 'https://real-debrid.com/d/6' },
      { name: 'Show/E07.mkv', size: 30, link: 'https://real-debrid.com/d/7' },
    ])
  })
})

describe('TorBox', () => {
  it('checks the cache read-only', async () => {
    const { fetch, calls } = mockFetch([
      ['GET', /\/torrents\/checkcached/, () => ({ json: { success: true, data: { [H1]: { name: 'x', size: 1 } } } })],
    ])
    expect(await new TorBox('KEY', fetch).checkCached([H1, H2])).toEqual({ [H1]: true, [H2]: false })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain(`hash=${H1}%2C${H2}`)
  })
})

describe('pickFile', () => {
  const files = [
    { name: 'Show/sample.mkv', size: 900, link: 's' },
    { name: 'Show/E06.mkv', size: 500, link: 'e6' },
    { name: 'Show/E07.mkv', size: 600, link: 'e7' },
    { name: 'Show/info.nfo', size: 1, link: 'n' },
  ]
  it('prefers the file named like the release, else the largest video that is not a sample', () => {
    expect(pickFile(files, 'E06.mkv')?.link).toBe('e6')
    expect(pickFile(files)?.link).toBe('e7')
  })
})
