import type { Candidate, MediaRef } from '../types.js'

/** A source of candidates. Dante never depends on which one it is talking to. */
export interface Engine {
  readonly name: string
  readonly kind: 'aiostreams' | 'stremio' | 'torznab'
  /** One line for `dante doctor` and the model; never includes secrets. */
  describe(): string
  search(media: MediaRef): Promise<Candidate[]>
  /** Cheap reachability check for `doctor`. Resolves with a short note, rejects with the reason. */
  ping(): Promise<string>
}
