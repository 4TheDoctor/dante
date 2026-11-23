# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "no engine is configured" | `dante.toml` has no `[[engines]]` | `dante setup`, or add one by hand |
| An engine fails, others answer | Engine down, wrong URL, expired key | `doctor` shows which and why |
| 0 results for a series | Wrong season/episode, or the title is spelled differently in releases | Search the season pack (no episode); try the original title |
| "not ready on … yet" | Not cached: the debrid is downloading it | `debrid_status` until ready, or pick a cached release |
| Real-Debrid: copyright (infringing_file) | Real-Debrid blocks that file since May 2026 | Another release, or AllDebrid/TorBox |
| Real-Debrid: not premium | The account expired | Renew, or remove it from `dante.toml` |
| Stremio shows no "Dante" source | Addon not installed, or the Dante session was closed | Install `http://<ip>:7879/manifest.json` (type `http://`; `stremio://` links force https), keep Dante open |
| Dub refused by audio4films (step/drift) | The two releases are different cuts | Pick another audio release of the same cut |
| The Inferno look draws in the stock style | Claude Code changed its mod API | `dante doctor` names the tested version; update Dante |
