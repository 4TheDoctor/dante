---
name: dante
description: "Trigger: find, choose or play a film, episode, documentary or anime; 4K, HDR or audio-language wishes; debrid cache (AllDebrid, Real-Debrid, TorBox); Stremio; /dante. Searches the user's engines, ranks by their preferences, plays."
license: MIT
compatibility: "Needs the dante CLI and its MCP server (brew install 4thedoctor/tap/dante, or npm i -g @4thedoctor/dante). audio4films is optional, for dubs."
metadata:
  author: 4TheDoctor
  version: 0.1.0
---

## Activation Contract

Use when the user wants to find, pick, add or watch a film, an episode, a documentary or anime with the `mcp__dante__*` tools. Decline software, games, plugins/VSTs, sample packs, ebooks, music libraries and private-tracker sign-ups: Dante is for video only.

## Hard Rules

- Search only through Dante's tools and the engines in `dante.toml`. Never look for torrent sites or links on the web.
- Never print, echo or store API keys, addon config URLs or Keychain values. Never run `security`.
- `add_to_debrid` only after the user picked that result. `check_cache` needs no permission; say that AllDebrid and Real-Debrid checks add and then remove.
- Claim only what the tool output shows: language, HDR format, cache status. "Multi audio, not confirmed" stays unconfirmed, and a language "mentioned, maybe only as subtitles" is not audio: say it is not confirmed.
- Read `CLAUDE.md` in the Dante folder (the user's tastes) before recommending.
- One question at a time.

## Decision Gates

| Situation | Action |
| --- | --- |
| Several titles match | Show the top 3 from `find_title` and ask which |
| Series without an episode | Ask; or search the whole season (season only) |
| The best video lacks the wanted audio and search shows a dub option | Offer `plan_dub` (audio4films); run it only on a yes; it takes minutes |
| Nothing cached | Say so; offer `add_to_debrid` on the best (it downloads first), or another release |
| An engine failed | Name it, carry on with the others, suggest `doctor` |
| Real-Debrid says copyright (infringing_file) | Pick another release or another service |
| A full disc (BDMV) is chosen | Needs a mounted folder: `prepare_bdmv` with its path, then VLC |
| Play on a TV | `play` with player `stremio` (install the addon once), or stremio-mcp if present |

## Execution Steps

1. `find_title`, unless the user gave an IMDb id.
2. `search_streams` with the title, year, season and episode.
3. `check_cache` on the top results that say "cache unknown" (at most 5).
4. Present the options (see the Output Contract) and recommend one, with its main reason.
5. On a choice: `play` (a cached result is added to the debrid to play it). If it is not cached: `add_to_debrid`, then `debrid_status`.
6. For a dub, on a yes: `add_to_debrid` both results, `plan_dub`, then run the `audio4films run …` command it returns with Bash, and report the verify lines it prints.

## Output Contract

A table of the top 3–5: `#`, release (short), video (resolution, HDR), audio languages, size, cache. Then one line: the pick and why, from the tool's "why". Then one question: what to do next.

## References

- `references/engines.md`: engine modes, what each one reports, setup.
- `references/troubleshooting.md`: common failures and fixes.
