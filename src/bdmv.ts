import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Disc folders that hold menus and navigation; small, and read constantly by BD-J menus. */
const MENU_DIRS = ['BDJO', 'JAR', 'PLAYLIST', 'CLIPINF', 'BACKUP', 'AUXDATA', 'META']
const MENU_FILES = ['MovieObject.bdmv', 'index.bdmv']

export interface PreparedDisc {
  path: string
  copied: string[]
  linked: string
}

/**
 * Make a full Blu-ray disc on a network mount (debrid WebDAV, NAS, rclone) play with its menus:
 * copy the menu and navigation folders locally and leave only the big STREAM folder on the
 * mount, through a symlink. Menus then answer instantly while the video streams.
 */
export function prepareBdmv(source: string, library: string, name = basename(source)): PreparedDisc {
  const bdmv = join(source, 'BDMV')
  if (!existsSync(join(bdmv, 'index.bdmv'))) {
    throw new Error(`${source} is not a Blu-ray folder: BDMV/index.bdmv is missing`)
  }
  if (!existsSync(join(bdmv, 'STREAM')) || !statSync(join(bdmv, 'STREAM')).isDirectory()) {
    throw new Error(`${source} has no BDMV/STREAM folder`)
  }
  const target = join(library, name.replace(/[/\\]/g, '_'))
  const targetBdmv = join(target, 'BDMV')
  mkdirSync(targetBdmv, { recursive: true })
  const copied: string[] = []
  for (const dir of MENU_DIRS) {
    if (existsSync(join(bdmv, dir))) {
      cpSync(join(bdmv, dir), join(targetBdmv, dir), { recursive: true })
      copied.push(`BDMV/${dir}`)
    }
  }
  for (const file of MENU_FILES) {
    if (existsSync(join(bdmv, file))) {
      cpSync(join(bdmv, file), join(targetBdmv, file))
      copied.push(`BDMV/${file}`)
    }
  }
  if (existsSync(join(source, 'CERTIFICATE'))) {
    cpSync(join(source, 'CERTIFICATE'), join(target, 'CERTIFICATE'), { recursive: true })
    copied.push('CERTIFICATE')
  }
  const link = join(targetBdmv, 'STREAM')
  rmSync(link, { force: true, recursive: false })
  symlinkSync(join(bdmv, 'STREAM'), link)
  return { path: target, copied, linked: join(bdmv, 'STREAM') }
}
