# Captain's Log

Speak into (Superwhisper)[https://superwhisper.com/], get a timestamped text log. Use it for brief updates/statuses/thoughts. Optionally, watch it update live in a browser.

Two independent scripts, no daemons, no installed services:

- **`captainslog.sh`** — pulls transcriptions from one Superwhisper Mode into a plain text file.
- **`captainslog-viewer.py`** — a live, styled, local web view of that file.

_N.B. This is necessarily based on precisely "Superwhisper running on MacOS", because that's what I'm using. It is not designed to be more general than that. If you want, break it into pieces and reassemble your own._

## How it works

1. You dictate in a specific Superwhisper **Mode** (recommended name: "Captain's Log" — but any name works, you tell the script what to match).
2. Superwhisper writes each recording to its own folder with a `meta.json` file, which includes the transcribed text and which Mode produced it.
3. `captainslog.sh` finds the ones matching your chosen Mode and appends them to a text file, one entry per block:

   ```
   [2026-08-05 09:12:03]
   Remember to follow up with the vendor about pricing.
   ```

4. There's no separate state/database file tracking what's already been logged. The "cursor" — how far along it's gotten — is just the latest timestamp already sitting in the output file. Point it at an empty or missing file and it backfills your entire history for that Mode; point it at a file with entries already in it and it only appends what's new. Run it as many times as you want; it never duplicates.

## Setup

1. In Superwhisper, create a Mode (Settings → Modes → click the name to rename it — this isn't obvious, the name field looks unlabeled). Give it a keyboard shortcut if you want a dedicated hotkey for logging specifically. Disable "auto-paste", so the transcript exists only in the `meta.json` of the recording.
2. Install `jq` if you don't have it: `brew install jq` (this is the only hard requirement beyond stock macOS).
3. Optionally, `brew install fswatch` if you want instant, event-driven updates instead of polling (see `--watch` below). Not required — everything works without it, just falls back to polling.
4. Run `captainslog.sh` by hand, or leave it running with `--watch`.

## Usage

```
captainslog.sh [output-file] [--mode "Mode Name"] [--watch [SECONDS]] [-q] [--with-viewer] [-k]
```

| Flag | Env var | Default |
|---|---|---|
| `output-file` | `CAPTAINSLOG_FILE` | `~/Desktop/voice-notes.txt` |
| `--mode` | `CAPTAINSLOG_MODE` | `"Captain's Log"` |
| `--watch` | `CAPTAINSLOG_WATCH` | off (single pass, then exit) |
| `-q`, `--quiet` | — | off (status messages print) |
| `--with-viewer` | `CAPTAINSLOG_WITH_VIEWER` | off |
| `-k`, `--kill` | — | n/a — always an explicit action |
| (recordings folder) | `CAPTAINSLOG_RECORDINGS_DIR` | auto-detected |

Command-line flags win over environment variables, which win over the defaults above.

**Examples**

```bash
captainslog.sh                         # one pass, pull whatever's new, exit
captainslog.sh --watch 30              # poll every 30 seconds
captainslog.sh --watch                 # event-driven via fswatch (falls back to polling every 60s if fswatch isn't installed)
captainslog.sh --watch --with-viewer   # also opens the live web viewer, stops it automatically when you stop this
captainslog.sh -q --watch 60           # same, but silent — only real errors print
captainslog.sh ~/notes/log.txt --mode "Work Notes"
captainslog.sh -k                      # kill any other running captainslog.sh instance(s), then exit
captainslog.sh -k --watch 30           # kill any existing instance(s), then start this one — "kill and relaunch"
```

**Stopping a `--watch` run**: Ctrl-C if it's in the foreground. If you backgrounded it yourself with `&`, the easiest way is `captainslog.sh -k` — it finds and stops any other running instance(s) for you. Equivalent by hand: plain `kill <pid>` (or `pkill -f "captainslog"`) — not `kill -INT`. This is a real POSIX shell quirk, not a choice this script makes: SIGINT is automatically ignored for anything launched with `&`, and no amount of `trap`-ing inside the script can override that. SIGTERM (what plain `kill` and `-k` both send) has no such restriction, which is why that's the reliable way to stop a backgrounded instance.

**`-k`/`--kill`**: stops any other running `captainslog.sh` instance(s) — matching on the full command line the same way `pkill -f captainslog.sh` would, but always excluding itself. If `-k` is the only argument, it exits immediately afterward. If there are other arguments, it kills first and then continues on with those — an easy way to restart a background instance with new settings in one command. Uses SIGTERM, so killed instances get to run their own cleanup (including stopping any viewer they'd launched via `--with-viewer`). Note: it can only clean up what it can find and kill directly — if another instance had `--with-viewer` running and this can't signal that instance (already dead, wrong user, etc.), that viewer is left orphaned.

## The viewer

```
captainslog-viewer.py [file] [--port PORT] [-q]
```

| Flag | Env var | Default |
|---|---|---|
| `file` | `CAPTAINSLOG_FILE` | `~/Desktop/voice-notes.txt` |
| `--port` | `CAPTAINSLOG_PORT` | `8420` |
| `-q` | — | off |

Standard library Python only, nothing to install. Binds to `127.0.0.1` only — not exposed to the network. It never writes anything to disk itself; it just re-reads the transcript file on each request and serves it as a styled page that polls for updates every couple of seconds, newest-first by default (toggle to flip it). Run it on its own, or let `captainslog.sh --with-viewer` launch and manage it for you.

`CAPTAINSLOG_FILE` is shared between both scripts on purpose — set it once and both tools point at the same file without repeating the path.

## Design notes

A few things worth knowing if you're modifying this:

- **No `osascript`/JXA.** An earlier version parsed each `meta.json` with `osascript`, which is slow once your recording history grows — spinning up a JS engine per file adds up. The current version narrows candidates with a fast `grep` text search first, then parses only those matches in a single batched `jq` call.
- **`jq empty` as a corruption guard.** One malformed `meta.json` (an interrupted write, a crash mid-save) can abort an entire batched `jq` call and silently report nothing — confirmed this the hard way. Candidates are validated with a cheap `jq empty` check before the real extraction pass.
- **Event mode uses a FIFO, not a raw pipe.** `fswatch ... | while read; do ...; done` looks reasonable but a `trap` set before an infinite pipeline like that won't fire on Ctrl-C/kill until the pipeline itself ends — which, for `fswatch`, is never. Running `fswatch` in the background writing to a named pipe, with the main loop blocking on a plain `read`, keeps the shell responsive to signals immediately.
