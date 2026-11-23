# Engines

Dante does not scrape anything itself. It asks the engines listed in `dante.toml`, in parallel,
and ranks what comes back.

| Type | What it is | Cache status | Notes |
| --- | --- | --- | --- |
| `aiostreams` | AIOStreams' REST search (`/api/v1/search`) | Per result, for every debrid configured in AIOStreams | The richest. Self-host it with one `docker run`, or use a public instance (it then sees your debrid keys) |
| `stremio` | Any Stremio addon: Comet, Torrentio, MediaFusion | From markers like `[RD+]`, `[AD⚡]`, `[TB download]` when the addon has your debrid key | Without a debrid key the results are plain torrents; Dante checks the cache itself |
| `torznab` | Jackett or Prowlarr | None; Dante checks it | The only way to find full Blu-ray discs (BDMV) |

## Cache checks per debrid

| Service | How Dante knows | Side effect |
| --- | --- | --- |
| TorBox | `torrents/checkcached` | None |
| AllDebrid | `magnet/upload` answers `ready` | Adds, then removes what you did not already have |
| Real-Debrid | No endpoint since Nov 2024: adds, looks, removes | Same, slower; Real-Debrid may refuse some cached files for copyright |

## Setup

`dante setup` asks for each engine and stores secrets in the Keychain (account `dante`).
`dante.toml` only holds references such as `keychain:dante.alldebrid`. On Linux and CI, the same
reference reads `DANTE_ALLDEBRID` from the environment.
