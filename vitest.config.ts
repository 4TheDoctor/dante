import { defineConfig } from 'vitest/config'

// plugin/tsconfig.json extends types that Claude Code writes and git ignores, so a fresh checkout
// has none: the tests compile with the repository's own.
export default defineConfig({ tsconfig: './tsconfig.json' })
