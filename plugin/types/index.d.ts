/** Where a request is, as the band above the prompt draws it. */
export type Journey = {
  /** What is being looked for, e.g. "Example Show S03E06". */
  title: string
  /** Furthest circle reached, 0 to 4. */
  reached: number
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt: number | null
}

export type TransferRow = {
  service: string
  id: string
  name: string
  ready: boolean
  status: string
}

declare module 'claude-code' {
  interface PluginState {
    dante: {
      journey: Shaped<Journey | null>
      transfers: Shaped<TransferRow[]>
      tick: number
    }
  }
}
