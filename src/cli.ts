#!/usr/bin/env node
import { loadConfig } from './config.js'
import { runDoctor } from './doctor.js'
import { searchText } from './format.js'
import { launch } from './launch.js'
import { serveMcp, VERSION } from './mcp.js'
import { Dante } from './service.js'
import { findTitle } from './title.js'

const HELP = `dante ${VERSION}: Debrid Aggregator & Navigator Tracker Engine, an AI media concierge for Claude Code

  dante                    open Claude Code in your Dante folder, with Dante's tools and look
  dante setup              first-time setup: engines, debrid keys (stored in the Keychain), preferences
  dante doctor             check Claude Code, engines, debrid accounts, players and audio4films
  dante search TITLE [--season N --episode N] [--limit N]
                           search and rank without Claude
  dante mcp                run the MCP server (Claude Code starts this itself)
  dante --version

Any other arguments go to Claude Code, e.g. \`dante --resume\`.
Folder: $DANTE_HOME, default ~/Dante.`

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  switch (command) {
    case '--version':
    case '-v':
      process.stdout.write(`dante ${VERSION}\n`)
      return 0
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(`${HELP}\n`)
      return 0
    case 'mcp':
      await serveMcp()
      return await new Promise<number>(() => {})
    case 'doctor':
      process.stdout.write(`${await runDoctor(new Dante(loadConfig()))}\n`)
      return 0
    case 'setup': {
      const { runSetup } = await import('./setup.js')
      return runSetup()
    }
    case 'search': {
      const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'))
      const query = positional.join(' ')
      if (!query) {
        process.stderr.write('usage: dante search TITLE [--season N --episode N]\n')
        return 1
      }
      const season = flag(rest, '--season')
      const episode = flag(rest, '--episode')
      const [match] = await findTitle(query, season ? 'series' : undefined)
      if (!match) {
        process.stderr.write(`No title found for "${query}"\n`)
        return 1
      }
      const dante = new Dante(loadConfig())
      const result = await dante.search({
        imdbId: match.imdbId,
        type: match.type,
        title: match.name,
        year: match.year,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
      })
      process.stdout.write(`${searchText(result, Number(flag(rest, '--limit') ?? 8))}\n`)
      return 0
    }
    default:
      return launch(argv)
  }
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  err => {
    process.stderr.write(`dante: ${(err as Error).message}\n`)
    process.exit(1)
  },
)
