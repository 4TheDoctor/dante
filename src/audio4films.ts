import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Where audio4films, the optional tool that puts a dub onto a better video, is installed from. */
export const SOURCE = 'git+https://github.com/4TheDoctor/audio4films'
export const INSTALL = `uv tool install ${SOURCE}`

/** The first line a command answers, or undefined when it is not installed. */
export async function version(command: string, args = ['--version']): Promise<string | undefined> {
  try {
    const { stdout } = await run(command, args, { timeout: 10_000 })
    return stdout.trim().split('\n')[0]
  } catch {
    return undefined
  }
}

/** Run a command in sight of the person, who cannot type into it. Says whether it went well. */
function runInSight(command: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

export interface Offer {
  yes: (question: string, fallback: boolean) => Promise<boolean>
  write: (text: string) => void
  version?: typeof version
  install?: typeof runInSight
}

/** Offer audio4films in setup. Dante works without it, so nothing here can fail the setup. */
export async function offerAudio4films({ yes, write, version: has = version, install = runInSight }: Offer): Promise<void> {
  write('\nDubs (optional): audio4films puts the audio of one release onto the better video of another.\n')
  const installed = await has('audio4films')
  if (installed) {
    write(`  Found ${installed}.\n`)
  } else {
    if (!(await yes('Install audio4films', false))) {
      write(`  Skipped. To add it later: ${INSTALL}\n`)
      return
    }
    const how: [string, string[]] | undefined = (await has('uv'))
      ? ['uv', ['tool', 'install', SOURCE]]
      : (await has('pipx'))
        ? ['pipx', ['install', SOURCE]]
        : undefined
    if (!how) {
      write(`  It needs uv (https://docs.astral.sh/uv) or pipx. Install one, then: ${INSTALL}\n`)
      return
    }
    write(`  ${how[0]} ${how[1].join(' ')}\n`)
    if (!(await install(...how))) {
      write('  It could not be installed; Dante works without it. Run that command again to retry.\n')
      return
    }
    if (!(await has('audio4films'))) write(`  Installed, but its folder is not in your PATH. Run: ${how[0] === 'uv' ? 'uv tool update-shell' : 'pipx ensurepath'}\n`)
  }
  if (!(await has('ffmpeg', ['-version']))) write('  It also needs FFmpeg 6 or newer (brew install ffmpeg, or apt install ffmpeg).\n')
}
