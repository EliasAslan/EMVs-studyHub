# Study Hub — Desktop Widget (Rainmeter, v0)

One small Rainmeter skin that shows the Study Hub desktop widget snapshot on the Windows
desktop.

The skin reads the **TXT snapshot** that Study Hub can export from **Einstellungen →
Desktop-Widget → „TXT für Rainmeter“** (`study-hub-widget-YYYY-MM-DD.txt`). Exporting is
manual only — the skin never writes files and the Study Hub app itself is not modified.

## What the widget shows

- **Start Here** — title of the one start-here entry (earliest open homework / next exam).
- **Upcoming deadlines** — up to three deadlines (title + remaining days, overdue shown as a
  negative number).
- **Open homework count** — number of open homework items.
- **Last updated** — the snapshot's `generatedAt` date.

Visual language: minimal, clean, neutral greys with a subtle green accent. The widget is a
small auto-sized text block (roughly 300 × 150 px).

## Install

1. Install [Rainmeter](https://www.rainmeter.net) on Windows.
2. Copy the skin folder into the Rainmeter skins folder, for example:
   - `C:\Users\<you>\Documents\Rainmeter\Skins\StudyHub\StudyHub.ini`
   - or any other folder that is registered as a Rainmeter skin (Manage → Skins → add folder).
3. Reload the skin in Rainmeter (Manage → Skins → Study Hub → Refresh, or the Rainmeter tray
   context menu → Refresh Skins).
4. Open the widget via the Rainmeter tray icon / Manage → Skins.

No `.rmskin` package is used yet — the skin source lives in this repository at
`desktop/StudyHub/StudyHub.ini` and is copied directly.

## Configure the snapshot file

Edit `desktop\StudyHub\StudyHub.ini`, section `[Variables]` and set:

```ini
SnapshotFile=C:\Users\<you>\Downloads\study-hub-widget-2026-11-10.txt
```

- The path must be fully qualified (absolute) — WebParser uses the `file://` protocol.
- After a new export, point `SnapshotFile` at the new file (or copy the new file over the old
  one and refresh).

## Export a snapshot from Study Hub

1. Open **Einstellungen → Desktop-Widget** in the Study Hub web app.
2. Press **„TXT für Rainmeter“** and save the download (default: `Downloads\study-hub-widget-YYYY-MM-DD.txt`).

## Interactions

- **Left click** on the widget → opens Study Hub in the default browser. The URL is set in the
  skin at `[Rainmeter]` → `LeftMouseUpAction` (`["http://localhost:5173"]` by default — adjust
  to your Study Hub origin).
- **Right click** on the widget → refreshes the skin (`[!Refresh]`), which re-reads the snapshot
  file. The WebParser measures also refresh automatically every ~30 seconds (`UpdateRate=30`).

## Missing file / invalid data

- Missing snapshot file → the WebParser measures fail silently and the widget shows fallbacks:
  - Start Here: `Keine offene Aufgabe`
  - Open homework count: `0 offen`
  - Last updated: `unbekannt`
- Empty or malformed fields in the snapshot are handled the same way (for example an empty
  `startTitle=` line or a missing `openCount=` value).

## Testing with realistic data

Export a snapshot with real content and check:

- German umlauts and special characters (e.g. `Müller — Physik: Energie ¦ Aufgabe 3`) render
  correctly (the skin reads the file as UTF-8 via `CodePage=65001`).
- Overdue deadlines show up as negative day counts (e.g. `-2`).
- Empty states (no homework / no start here) fall back gracefully.

## Troubleshooting

- Skin does not load → check the Rainmeter log (Rainmeter tray → About → Log) and that the
  `SnapshotFile` variable points to an existing file.
- Garbled umlauts → the snapshot must be UTF-8; the skin sets `CodePage=65001`.
- Nothing shows → right click the widget and refresh; check the Rainmeter log for WebParser
  connection errors.
