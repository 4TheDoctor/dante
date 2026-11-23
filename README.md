# Dante

**An AI media concierge for Claude Code.** Ask for a film or an episode in plain words. Dante searches the
engines you already use, checks what is instantly available in your debrid account, ranks every release
against your preferences and says why, adds what you choose, and plays it.

*[Leer en español](README.es.md)*

The tools to search and resolve streams are mature. What was missing is someone who reads all the results,
knows you want 4K Dolby Vision with Castilian audio, notices that the best picture has no Spanish track but
another release does, and tells you which one and why. That is Dante.

What it looks like (an illustrative reply, not a transcript):

```text
$ dante
◉ ◉ ◉ ○ ○  Third circle: cache · Night of the Living Dead · 6s

❧ For Night of the Living Dead (1968) the pick is the 4K remux: 2160p HDR10, untouched
  video, Castilian and English audio, cached on AllDebrid. The 1080p remux is a third of
  the size if you prefer.
```

`dante search` gives the same ranking without the AI (real output on a public-domain film, release names shortened):

```text
Night of the Living Dead (1968): 143 results after ranking, from torrentio (145).

1. torrentio:1  score 95  … 4Kremux2160 ….mkv
   2160p · HDR10 · REMUX · DD · 2.0 · 55.7 GB · 0 seeders · …
   audio: Castilian Spanish, English · cache unknown
   why: +40 2160p (preference 1 of 2) | +15 HDR10 | +30 audio in Castilian Spanish | +10 remux (untouched video and audio)
```

## What it does

- **Searches your engines in parallel:** [AIOStreams](https://github.com/Viren070/AIOStreams), any Stremio addon (Comet, Torrentio, MediaFusion), and Jackett/Prowlarr. Dante does not scrape anything itself.
- **Ranks with reasons.** Every release gets a score with the points in words ("+25 DV", "-60 no Castilian audio known"), so you can check the choice.
- **Checks the cache** on AllDebrid, Real-Debrid and TorBox, and cleans up whatever it had to add to check.
- **Adds, resolves and plays:** IINA, VLC or mpv, or a "Dante" source inside Stremio on any device (the TV too).
- **Fills language gaps.** When the best video lacks your language and another release has it, it plans the dub for [audio4films](https://github.com/4TheDoctor/audio4films): synced, lossless, verified.
- **Full Blu-ray discs (BDMV) with menus:** copies the menus locally and streams the video from the network mount, so BD-J menus do not lag.
- **Its own look ("Inferno"):** the laurelled Dante in the header, five circles above the prompt that follow each request (title, search, cache, add, play), and one quiet line per tool. Official Claude Code hooks only; Claude Code itself is not modified. English and Spanish.

## Install

Needs [Claude Code](https://claude.com/claude-code) and Node 22 or newer.

```bash
brew install 4thedoctor/tap/dante
# or
npm install -g @4thedoctor/dante
```

Then run `dante`. The first time it asks for your engines and debrid keys (stored in the macOS Keychain; on
Linux in the Secret Service or environment variables) and creates `~/Dante`, where it always opens.

```bash
dante                # open Claude Code in ~/Dante, with Dante's tools and look
dante doctor         # check Claude Code, engines, debrid accounts, players, audio4films
dante search TITLE --season 3 --episode 6
dante setup          # change engines, keys or preferences
```

Preferences live in `~/Dante/dante.toml`; your tastes in plain words go in `~/Dante/CLAUDE.md`.

## Engines

| Engine | Gives | Needs |
| --- | --- | --- |
| AIOStreams | Many addons and debrids in one search, cached or not per result | Your own instance (one `docker run`) or a public one. A public instance sees your debrid keys |
| Stremio addon | Whatever that addon finds; cache markers if it has your debrid key | Its manifest URL (kept in the Keychain) |
| Jackett / Prowlarr | Your indexers, and full Blu-ray discs | Torznab URL and API key |

## What Dante does not do

Dante is for **films, series, documentaries and anime**. It does not search for software, games, plugins or
sample packs, it does not look for torrent sites on the web, and it does not monitor private-tracker
sign-ups. See [DISCLAIMER.md](DISCLAIMER.md).

## How it is built

TypeScript, one npm package: a small CLI (`dante`), an MCP server Claude Code starts (`dante mcp`), a Claude
Code plugin (the skill, the MCP wiring, and the Inferno mod in `plugin/hooks/`), and the ranking, engine and
debrid code in `src/`. Debrid keys stay in the Keychain and are only read by the process that needs them.

```bash
npm install && npm test
node dist/cli.js doctor        # after npm run build
claude --plugin-dir plugin     # load the plugin in a plain Claude Code session
```

## Prior art

- [AIOStreams](https://github.com/Viren070/AIOStreams), [Comet](https://github.com/g0ldyy/comet), [MediaFusion](https://github.com/mhdzumair/MediaFusion), [Torrentio](https://github.com/TheBeastLT/torrentio-scraper): the engines Dante talks to.
- [StremThru](https://github.com/MunifTanjim/stremthru), [Debrid Media Manager](https://github.com/debridmediamanager/debrid-media-manager), [zurg](https://github.com/debridmediamanager/zurg-public): debrid layers and libraries.
- [stremio-mcp](https://github.com/YoanWai/stremio-mcp): an MCP server for Stremio and Android TV; pairs well with Dante for the TV.

## License

[MIT](LICENSE)
