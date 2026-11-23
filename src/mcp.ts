import { createRequire } from 'node:module'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { prepareBdmv } from './bdmv.js'
import { danteHome, loadConfig, resolvePath } from './config.js'
import { runDoctor } from './doctor.js'
import { originalLanguageOf, planDub } from './dub.js'
import { cacheText, searchText } from './format.js'
import { formatSize, redactUrl, resolveFinalUrl } from './http.js'
import { openInPlayer } from './play.js'
import { lanAddress, makeAddonServer, PickRegistry } from './serve.js'
import { Dante } from './service.js'
import { findTitle } from './title.js'
import { DEBRID_SERVICES, type MediaType } from './types.js'

const require = createRequire(import.meta.url)
export const VERSION: string = (require('../package.json') as { version: string }).version

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (err: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true })
const service = z.enum(DEBRID_SERVICES).optional().describe('Debrid service; omit to use the one where it is cached, or the first configured')

export function buildServer(dante = new Dante(loadConfig())): McpServer {
  const server = new McpServer({ name: 'dante', version: VERSION })
  let addon: { port: number } | undefined
  const registry = new PickRegistry(join(danteHome(), 'stremio.json'))

  server.registerTool(
    'find_title',
    {
      description: 'Find a film or series by name and get its IMDb id. Call this first unless the user gave an IMDb id.',
      inputSchema: { query: z.string().describe('Title as the user said it, optionally with a year'), type: z.enum(['movie', 'series']).optional() },
    },
    async ({ query, type }) => {
      try {
        const matches = await findTitle(query, type as MediaType | undefined)
        if (!matches.length) return text(`No title found for "${query}".`)
        return text(matches.map((m, i) => `${i + 1}. ${m.name} (${m.releaseInfo ?? m.year ?? '?'}) · ${m.type} · ${m.imdbId}${m.people ? ` · ${m.people}` : ''}`).join('\n'))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'search_streams',
    {
      description:
        'Search every configured engine for one film or one episode, rank the results against the preferences in dante.toml, and show why each ranked where it did. Results carry ids for the other tools.',
      inputSchema: {
        imdb_id: z.string().regex(/^tt\d+$/),
        type: z.enum(['movie', 'series']),
        title: z.string().describe('Title from find_title; Torznab engines search by name'),
        year: z.number().int().optional(),
        season: z.number().int().optional(),
        episode: z.number().int().optional(),
        limit: z.number().int().min(1).max(50).default(8),
        languages: z.array(z.string()).optional().describe('Override the wanted audio languages for this search, e.g. ["spa"]'),
      },
    },
    async ({ imdb_id, type, title, year, season, episode, limit, languages }) => {
      try {
        const result = await dante.search(
          { imdbId: imdb_id, type, title, year, season, episode },
          languages ? { languages } : {},
        )
        return text(searchText(result, limit))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'check_cache',
    {
      description:
        'Ask the debrid services whether these results are cached (instant). TorBox answers read-only; AllDebrid and Real-Debrid have no read-only check, so Dante adds each torrent, looks, and removes it again unless the user already had it.',
      inputSchema: { ids: z.array(z.string()).min(1).max(10), service },
    },
    async ({ ids, service: s }) => {
      try {
        const { ranked, warnings } = await dante.checkCache(ids, s)
        return text([...ranked.map(r => `${r.candidate.id}  ${cacheText(r)}  ${r.candidate.name}`), ...warnings.map(w => `WARNING: ${w}`)].join('\n'))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'add_to_debrid',
    {
      description: 'Add one result to the debrid account. Only after the user chose this result.',
      inputSchema: { id: z.string(), service },
    },
    async ({ id, service: s }) => {
      try {
        const t = await dante.add(id, s)
        return text(`Added to ${t.service} (transfer ${t.id}): ${t.name ?? id}. ${t.ready ? 'Ready to play.' : `Status: ${t.status}.`}`)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'get_links',
    {
      description:
        'Get a direct, playable link for one result that is already on the debrid (add_to_debrid first). Links expire and belong to the user; do not paste them anywhere public.',
      inputSchema: { id: z.string(), service },
    },
    async ({ id, service: s }) => {
      try {
        const link = await dante.links(id, s)
        const final = await resolveFinalUrl(link.url)
        const shown = final.resolved || link.via !== dante.candidate(id).candidate.engine ? final.url : redactUrl(final.url)
        return text(
          `${link.filename ?? id} · ${formatSize(link.size)} · via ${link.via}\n${shown}` +
            (shown === final.url ? '' : '\n(The engine link carries your config, so it is not shown; use play with this id.)'),
        )
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'play',
    {
      description:
        'Play the result the user picked: in a local player (IINA, VLC, mpv), or as a "Dante" source in Stremio on any device in the home network. For an Android TV, Stremio is the way. A cached result is added to the debrid to play it; one that is not cached needs add_to_debrid first.',
      inputSchema: {
        id: z.string(),
        player: z.enum(['auto', 'iina', 'vlc', 'mpv', 'stremio']).optional(),
        service,
      },
    },
    async ({ id, player, service: s }) => {
      try {
        const r = dante.candidate(id)
        const link = await dante.links(id, s, true)
        const final = await resolveFinalUrl(link.url)
        const chosen = player ?? dante.config.play.player
        if (chosen === 'stremio') {
          const search = dante.lastSearch()
          const media = search?.media
          if (!media) throw new Error('search first, so Dante knows which title this is')
          const stremioId = media.type === 'series' && media.season !== undefined && media.episode !== undefined
            ? `${media.imdbId}:${media.season}:${media.episode}`
            : media.imdbId
          registry.add({ stremioId, type: media.type, url: final.url, title: media.title ?? r.candidate.name, filename: link.filename, size: link.size, addedAt: new Date().toISOString() })
          if (!addon) {
            const port = dante.config.play.port
            await new Promise<void>((resolve, reject) => {
              const srv = makeAddonServer(registry)
              srv.once('error', reject)
              srv.listen(port, '0.0.0.0', () => resolve())
            })
            addon = { port }
          }
          return text(
            `In Stremio, open ${media.title ?? 'the title'} and pick the "Dante" source.\n` +
              `First time only: Add-ons → Add addon → type http://${lanAddress()}:${addon.port}/manifest.json (http, not stremio://).\n` +
              'The source is served while this Dante session stays open.',
          )
        }
        const used = await openInPlayer(final.url, chosen)
        return text(`Playing ${link.filename ?? r.candidate.name} in ${used}.`)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'debrid_status',
    {
      description: 'Status of what Dante added to the debrid services (downloading, ready).',
      inputSchema: { service },
    },
    async ({ service: s }) => {
      try {
        const list = await dante.status(s)
        if (!list.length) return text('Nothing added through Dante yet.')
        return text(list.map(t => `${t.service} ${t.id}  ${t.ready ? 'ready' : t.status}${t.progress !== undefined && !t.ready ? ` ${t.progress}%` : ''}  ${t.name ?? t.candidateId}`).join('\n'))
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'plan_dub',
    {
      description:
        'Put the audio of one result onto the video of another with audio4films (synced, lossless). Resolves both links and returns the exact command to run. Both must be on the debrid already (add_to_debrid, once the user said yes). Needs audio4films installed.',
      inputSchema: { video_id: z.string().optional(), audio_id: z.string().optional(), service },
    },
    async ({ video_id, audio_id, service: s }) => {
      try {
        const search = dante.lastSearch()
        const auto = search ? planDub(search.ranked, dante.prefs) : undefined
        const videoId = video_id ?? auto?.video.candidate.id
        const audioId = audio_id ?? auto?.audio.candidate.id
        if (!videoId || !audioId) throw new Error('no dub plan: give video_id and audio_id from a search')
        const video = dante.candidate(videoId)
        const audio = dante.candidate(audioId)
        const [v, a] = await Promise.all([dante.links(videoId, s), dante.links(audioId, s)])
        const [vf, af] = await Promise.all([resolveFinalUrl(v.url), resolveFinalUrl(a.url)])
        const lang = audio.languages.find(l => dante.prefs.languages.includes(l)) ?? dante.prefs.languages[0] ?? 'spa'
        const vo = originalLanguageOf(video, dante.prefs.languages)
        return text(
          [
            `Video: ${video.candidate.name}`,
            `Audio: ${audio.candidate.name}`,
            'Run (audio4films measures the offset at 6 points and refuses if the cuts differ):',
            `audio4films run "${vf.url}" "${af.url}" --vo-lang ${vo} --dub-lang ${lang === 'lat' ? 'spa' : lang}`,
          ].join('\n'),
        )
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'prepare_bdmv',
    {
      description:
        'Make a full Blu-ray folder on a network mount (debrid WebDAV, NAS) play with its menus: copies the menus locally and links the video. Returns the folder to open in VLC.',
      inputSchema: { source_path: z.string().describe('Folder that contains BDMV/'), name: z.string().optional() },
    },
    async ({ source_path, name }) => {
      try {
        const library = resolvePath(dante.config.bdmv.library)
        const disc = prepareBdmv(source_path, library, name)
        return text(`Ready: ${disc.path}\nCopied: ${disc.copied.join(', ')}\nSTREAM links to: ${disc.linked}\nOpen it in VLC with Media → Open Disc (Blu-ray, menus on).`)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    'progress',
    {
      description:
        'Show the person how far along a request is: it moves Dante down the circles beside the chat. For requests of three or more steps that find_title, search_streams, check_cache, add_to_debrid and play do not already cover. Call it once at the start with done 0 and the number of steps, then once after each step that is really finished. When it is about one film or series, pass its imdb_id.',
      inputSchema: {
        title: z.string().max(80).describe('What is being done, in a few words'),
        total: z.number().int().min(1).max(50),
        done: z.number().int().min(0).max(50),
        imdb_id: z.string().regex(/^tt\d+$/).optional().describe('The film or series it is about, when known: its logo is shown at the end'),
      },
    },
    async ({ title, total, done }) => text(`${title}: ${Math.min(done, total)} of ${total} steps done.`),
  )

  server.registerTool(
    'doctor',
    { description: 'Check engines, debrid accounts, players and audio4films. Never prints keys.', inputSchema: {} },
    async () => text(await runDoctor(dante)),
  )

  return server
}

export async function serveMcp(): Promise<void> {
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}

