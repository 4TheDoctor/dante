/** Where a request is, as the band above the prompt draws it. */
export type Journey = {
  /** What is being looked for, e.g. "Example Show S03E06". */
  title: string
  /** Furthest circle reached, 0 to 4. */
  reached: number
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt: number | null
  /** The steps that really happened. */
  did: StepName[]
  facts: Facts
  /** Why it failed and the circle it broke (0 to 8), when it did. */
  reason: string
  fault: number | null
  /** The download it added: service and number. */
  transfer: string | null
}

export type StepName = 'title' | 'search' | 'cache' | 'add' | 'play'

/** What each step found, as its tool reported it. */
export type Facts = {
  year?: number
  results?: number
  cached?: number
  checked?: number
  /** The service where it is cached, added or comes from. */
  where?: string
  percent?: number
  player?: string
}

export type TransferRow = {
  service: string
  id: string
  name: string
  ready: boolean
  status: string
}

/** How far a request that is not about a film has got. */
export type TaskTally = { total: number; done: number }

/** Its steps: declared with Dante's `progress` tool, or from Claude Code's own task list. */
export type TaskList = { title: string; all: Record<string, 'open' | 'done'> }

declare module 'claude-code' {
  interface PluginState {
    dante: {
      journey: Shaped<Journey | null>
      transfers: Shaped<TransferRow[]>
      tick: number
      tasks: Shaped<TaskList>
    }
  }
}
