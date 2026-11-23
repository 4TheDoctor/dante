import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type Player = 'auto' | 'iina' | 'vlc' | 'mpv' | 'stremio'

async function onPath(command: string): Promise<boolean> {
  try {
    await run('/usr/bin/env', ['which', command])
    return true
  } catch {
    return false
  }
}

const MAC_APPS: Record<string, string> = { iina: 'IINA', vlc: 'VLC' }

export async function availablePlayers(): Promise<Array<Exclude<Player, 'auto' | 'stremio'>>> {
  const found: Array<Exclude<Player, 'auto' | 'stremio'>> = []
  if (platform() === 'darwin') {
    for (const [id, app] of Object.entries(MAC_APPS)) {
      if (existsSync(`/Applications/${app}.app`)) found.push(id as 'iina' | 'vlc')
    }
  } else if (await onPath('vlc')) {
    found.push('vlc')
  }
  if (await onPath('mpv')) found.push('mpv')
  return found
}

/** Open a URL in a local player. Returns the player used. */
export async function openInPlayer(url: string, player: Exclude<Player, 'stremio'> = 'auto'): Promise<string> {
  const players = await availablePlayers()
  const chosen = player === 'auto' ? players[0] : player
  if (!chosen) throw new Error('no player found: install IINA, VLC or mpv, or use the stremio player')
  const detach = (command: string, args: string[]) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
  }
  if (chosen === 'mpv') detach('mpv', ['--force-window=immediate', url])
  else if (platform() === 'darwin') detach('open', ['-a', MAC_APPS[chosen]!, url])
  else detach(chosen, [url])
  return chosen
}
