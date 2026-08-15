#!/bin/bash
#
# captainslog.sh — pull Superwhisper transcriptions from one Mode into a text file.
#
# Usage:
#   captainslog.sh [output-file] [--mode "Mode Name"] [--watch [SECONDS]] [-q] [--with-viewer]
#
# Every setting can come from, in priority order: a command-line argument,
# then an environment variable, then a built-in default.
#
#   argument         env var                         default
#   ---------------  ------------------------------  ------------------------------
#   output-file      CAPTAINSLOG_FILE                ~/Desktop/voice-notes.txt
#   --mode           CAPTAINSLOG_MODE                "Captain's Log"
#   --watch          CAPTAINSLOG_WATCH               (unset — single pass, no watch)
#   (none)           CAPTAINSLOG_RECORDINGS_DIR      auto-detected (see below)
#   -q, --quiet      (no env var)                    off — status messages print
#   --with-viewer    CAPTAINSLOG_WITH_VIEWER         off — viewer not launched
#   -k, --kill       (no env var)                    n/a — always an explicit action
#
# Behavior:
#   - No state file. The "cursor" (how far we've already logged) is derived
#     from the latest [YYYY-MM-DD HH:MM:SS] stamp already present in the
#     output file itself.
#   - If the output file doesn't exist yet (or has no stamps in it), every
#     matching recording in Superwhisper's history is pulled in — a full
#     backfill happens automatically, no separate "mode" flag needed.
#   - If it already has stamps, only recordings newer than the latest one
#     get appended (true incremental).
#   - Only recordings whose meta.json "modeName" matches --mode are touched.
#   - Without --watch: runs one pass and exits (good for cron, or just
#     running by hand whenever you want to "pull now").
#   - --watch SECONDS: polls, running that same pass every SECONDS until you
#     stop it.
#   - --watch with no number: event-driven instead of polling. Uses fswatch
#     (brew install fswatch) to react the moment Superwhisper writes a new
#     recording, no timer at all. If fswatch isn't installed, this falls
#     back to polling every $DEFAULT_POLL_FALLBACK seconds and says so.
#   - Either watch mode: Ctrl-C in the foreground, or plain `kill <pid>` if
#     you background it yourself with `&`. No daemon, no PID file, no login
#     item.
#     IMPORTANT: if backgrounded with `&`, stop it with plain `kill` (which
#     sends SIGTERM), not `kill -INT`. This isn't a choice this script makes
#     — it's a POSIX shell rule: SIGINT is automatically set to be ignored
#     for any command launched with `&`, and no `trap` can override that,
#     even an explicit one. Confirmed this the hard way while testing.
#     SIGTERM has no such restriction, which is why it's trapped here too
#     and is the reliable way to stop a backgrounded instance.
#   - --with-viewer: only takes effect in --watch mode (poll or event) —
#     ignored for a single one-shot pass, since there'd be nothing to keep
#     watching. If captainslog-viewer.py exists in the same folder as this
#     script, it's launched in the background pointed at the same output
#     file, and stopped automatically when this script stops (same trap
#     that handles Ctrl-C/kill for the watch loop itself also stops the
#     viewer, so there's nothing left running behind).
#     "Same folder as this script" means the real script file, even if
#     you invoke captainslog.sh through a symlink (e.g. one on your PATH
#     pointing back into this repo) — the symlink is resolved first, so
#     the viewer is looked for next to the target, not next to the link.
#   - -k, --kill: finds every OTHER running captainslog.sh process (matching
#     on "captainslog.sh" in the full command line, the same way `pkill -f
#     captainslog.sh` would) and sends it SIGTERM — the current process
#     always excludes itself first, so this is safe to combine with other
#     flags. Uses SIGTERM specifically (not SIGKILL) so any instance being
#     killed still runs its own trap: "Stopped.", and — if it was started
#     with --with-viewer — cleanly stops its own viewer too, rather than
#     orphaning it.
#     If -k/--kill is the ONLY argument given, it exits immediately after
#     killing. If other arguments are given alongside it, it kills first
#     and then this same process just continues on with those arguments —
#     effectively "kill whatever's running, then take over" in one command.
#     This does NOT clean up a viewer left behind by an instance that isn't
#     found (e.g. one already dead, or one started from a different copy
#     of this script) — it only stops what -k itself can see and kill.
#
# CAPTAINSLOG_RECORDINGS_DIR, if set, is used as-is (skipping auto-detection)
# and must point directly at Superwhisper's recordings folder — the one
# containing one subfolder per recording, each with a meta.json in it.
#
# Requires `grep` (stock macOS) and `jq` (not stock — install with
# `brew install jq` if you don't already have it). Recordings are first
# narrowed down with a fast text search via grep, then only the matching
# candidates are parsed for real by a single batched jq call — this avoids
# spawning a process per recording, which is what made earlier versions of
# this script (using osascript/JXA per file) slow once history grew large.
# `fswatch` (brew install fswatch) is optional, only needed for event-driven
# --watch; everything else works without it.

set -u

# ---- Defaults / arg parsing ------------------------------------------

DEFAULT_POLL_FALLBACK=60

# Written as "set the default, then override if the env var is present"
# rather than the more compact "${CAPTAINSLOG_MODE:-Captain's Log}" form —
# an apostrophe inside a ${VAR:-default} default value breaks bash's
# parser even inside double quotes (confirmed while testing this), so
# this form is used throughout for safety, not just here.
OUTPUT_FILE="$HOME/Desktop/voice-notes.txt"
[ -n "${CAPTAINSLOG_FILE:-}" ] && OUTPUT_FILE="$CAPTAINSLOG_FILE"

MODE_NAME="Captain's Log"
[ -n "${CAPTAINSLOG_MODE:-}" ] && MODE_NAME="$CAPTAINSLOG_MODE"

WATCH_ARG=""
[ -n "${CAPTAINSLOG_WATCH:-}" ] && WATCH_ARG="$CAPTAINSLOG_WATCH"

RECORDINGS_DIR_OVERRIDE=""
[ -n "${CAPTAINSLOG_RECORDINGS_DIR:-}" ] && RECORDINGS_DIR_OVERRIDE="$CAPTAINSLOG_RECORDINGS_DIR"

QUIET=0

# Pre-scan for -q/--quiet before the real argument parsing loop below, so
# it's already in effect no matter where in the argument list it appears —
# in particular, so that -k/--kill (which can act before the main loop
# reaches a later -q) already knows whether to stay quiet.
for _prescan_arg in "$@"; do
  case "$_prescan_arg" in
    -q|--quiet) QUIET=1 ;;
  esac
done

WITH_VIEWER=0
[ -n "${CAPTAINSLOG_WITH_VIEWER:-}" ] && WITH_VIEWER=1

# Prints its arguments unless -q/--quiet was given. Used for everything
# that's just status ("no new recordings", "polling every Ns", "Stopped.")
# — never for the ERROR lines (those go to stderr and always print, quiet
# or not) and never for the lines that write the transcript itself to
# $OUTPUT_FILE (that's file content, not console noise).
log() {
  [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"
}

# Resolves ${BASH_SOURCE[0]} all the way through any symlinks (including
# chains of them) and prints the directory the REAL underlying file lives
# in — not the directory the symlink itself sits in. This matters for
# finding captainslog-viewer.py: if this script is invoked via a symlink
# (e.g. something on PATH pointing back into this repo), plain
# `dirname "${BASH_SOURCE[0]}"` gives the symlink's folder, not this
# script's actual folder, and the viewer lookup would fail. Written by
# hand with `readlink` + a loop rather than `readlink -f`, since macOS's
# stock BSD `readlink` doesn't support -f (only GNU readlink does).
resolve_script_dir() {
  local source dir
  source="${BASH_SOURCE[0]}"
  while [ -h "$source" ]; do
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    # A relative symlink target is relative to the symlink's own
    # directory, not to wherever we currently are — resolve it there.
    [[ "$source" == /* ]] || source="$dir/$source"
  done
  cd -P "$(dirname "$source")" && pwd
}

# Kills every OTHER running captainslog.sh, excluding this process itself
# so -k/--kill can safely be combined with other flags to "kill, then take
# over". Matches on the full command line the same way `pkill -f
# captainslog.sh` would, but via pgrep+kill instead of pkill directly —
# pkill's own self-exclusion only covers the pkill process, not the shell
# that invoked it, and this script's own command line also contains
# "captainslog.sh", so a plain `pkill -f captainslog.sh` run from inside
# this script would also match and kill itself.
kill_other_instances() {
  local self_pid=$$
  local pids
  pids="$(pgrep -f 'captainslog' 2>/dev/null | grep -v -x "$self_pid")"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    log "Killed other captainslog.sh instance(s): $(echo "$pids" | tr '\n' ' ' | sed 's/ *$//')"
  else
    log "No other captainslog.sh instances running."
  fi
}

usage() {
  cat <<USAGE
Usage: $(basename "$0") [output-file] [--mode "Mode Name"] [--watch [SECONDS]] [-q] [--with-viewer] [-k]

  output-file    Where transcriptions get appended.
                 Default: \$CAPTAINSLOG_FILE, or ~/Desktop/voice-notes.txt

  --mode         Superwhisper Mode to pull from.
                 Default: \$CAPTAINSLOG_MODE, or "Captain's Log"

  -q, --quiet    Suppress all status output ("no new recordings", "polling
                 every Ns", "Stopped.", etc). Errors still print, always,
                 to stderr. The transcript file itself is unaffected either
                 way — this only silences the terminal.

  --watch        With a number: poll every SECONDS.
                 With no number: event-driven via fswatch (falls back to
                 polling every ${DEFAULT_POLL_FALLBACK}s if fswatch isn't installed).
                 Without this flag at all: run once and exit.
                 Default source if flag omitted: \$CAPTAINSLOG_WATCH
                 (a number in that env var means poll; any other non-empty
                 value means event-driven; unset means single pass)

  --with-viewer  Only applies alongside --watch. If captainslog-viewer.py
                 exists next to this script, launches it in the background
                 pointed at the same output file, and stops it automatically
                 when this script stops. Ignored for a plain one-shot run.
                 Default source if flag omitted: \$CAPTAINSLOG_WITH_VIEWER
                 (any non-empty value enables it)

  -k, --kill     Kill every other running captainslog.sh (SIGTERM, so they
                 clean up their own viewer/state before exiting). Excludes
                 this process itself. If -k is the ONLY argument given,
                 exits right after. If given alongside other arguments,
                 kills first and then continues on with those arguments —
                 "kill whatever's running, then take over."

  Also honored: \$CAPTAINSLOG_RECORDINGS_DIR to point directly at
  Superwhisper's recordings folder instead of auto-detecting it.

  Stopping a --watch run: Ctrl-C in the foreground, or plain "kill <pid>"
  if you backgrounded it with &. Use plain kill, not "kill -INT" — a
  backgrounded process can never respond to SIGINT (a POSIX shell rule,
  not something this script controls), but SIGTERM (what plain kill sends)
  always works. This also stops the viewer if --with-viewer started one.
USAGE
}

# Captured before the loop consumes anything, since "was -k the ONLY
# argument" needs the original count, not however many are left at
# whatever point the loop happens to reach -k.
TOTAL_ARGS=$#

while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--kill)
      kill_other_instances
      if [ "$TOTAL_ARGS" -eq 1 ]; then
        exit 0
      fi
      shift 1
      ;;
    --mode)
      MODE_NAME="${2:-}"; shift 2 ;;
    --watch)
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        WATCH_ARG="$2"; shift 2
      else
        WATCH_ARG="watch"; shift 1
      fi
      ;;
    -q|--quiet)
      QUIET=1; shift 1 ;;
    --with-viewer)
      WITH_VIEWER=1; shift 1 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      OUTPUT_FILE="$1"; shift ;;
  esac
done

# Resolve WATCH_ARG (from --watch or $CAPTAINSLOG_WATCH) into a concrete mode.
WATCH_MODE="none"
INTERVAL=""
if [[ -n "$WATCH_ARG" ]]; then
  if [[ "$WATCH_ARG" =~ ^[0-9]+$ ]]; then
    WATCH_MODE="poll"
    INTERVAL="$WATCH_ARG"
  else
    WATCH_MODE="event"
  fi
fi

CANDIDATE_DIRS=(
  "$HOME/Documents/superwhisper/recordings"
  "$HOME/Library/Application Support/superwhisper/recordings"
)

resolve_recordings_dir() {
  if [ -n "$RECORDINGS_DIR_OVERRIDE" ]; then
    if [ -d "$RECORDINGS_DIR_OVERRIDE" ]; then
      printf '%s\n' "$RECORDINGS_DIR_OVERRIDE"
      return 0
    fi
    echo "ERROR: CAPTAINSLOG_RECORDINGS_DIR is set to '$RECORDINGS_DIR_OVERRIDE' but that directory doesn't exist." >&2
    return 1
  fi
  for d in "${CANDIDATE_DIRS[@]}"; do
    if [ -d "$d" ]; then
      printf '%s\n' "$d"
      return 0
    fi
  done
  echo "ERROR: could not find Superwhisper's recordings folder. Set CAPTAINSLOG_RECORDINGS_DIR to point at it directly." >&2
  return 1
}

RECORDINGS_DIR="$(resolve_recordings_dir)" || exit 1

run_once() {
  mkdir -p "$(dirname "$OUTPUT_FILE")"
  touch "$OUTPUT_FILE"

  # Cursor = latest [YYYY-MM-DD HH:MM:SS] stamp already in the output file.
  # Zero-padded ISO-like format sorts correctly as plain strings.
  local cursor
  cursor="$(grep -oE '\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\]' "$OUTPUT_FILE" \
    | tr -d '[]' | sort | tail -1)"

  # Stage 1: fast text pre-filter. Only meta.json files that even mention
  # this mode's name get looked at further — this is what avoids parsing
  # every recording Superwhisper has ever made on every single run.
  # NOTE: MODE_NAME is matched as a literal regex fragment here, unescaped.
  # Fine for a plain name like "Captain's Log"; a mode name containing
  # regex metacharacters (parentheses, brackets, etc.) could behave oddly
  # — a known follow-up, not handled yet.
  local candidates
  candidates="$(grep -rlE "\"modeName\"[[:space:]]*:[[:space:]]*\"${MODE_NAME}\"" \
    "$RECORDINGS_DIR" --include='meta.json' 2>/dev/null)"

  if [ -z "$candidates" ]; then
    log "[$(date '+%Y-%m-%d %H:%M:%S')] No new recordings for mode \"$MODE_NAME\"."
    return 0
  fi

  # Stage 2: drop any candidate that isn't valid JSON (an interrupted
  # write, an app crash mid-save, etc.). One bad file would otherwise
  # abort the whole batched jq call below and silently report nothing —
  # confirmed that failure mode while testing this, so it's guarded here.
  local good_candidates
  good_candidates="$(printf '%s\n' "$candidates" | while IFS= read -r f; do
    jq empty "$f" >/dev/null 2>&1 && printf '%s\n' "$f"
  done)"

  if [ -z "$good_candidates" ]; then
    log "[$(date '+%Y-%m-%d %H:%M:%S')] No new recordings for mode \"$MODE_NAME\"."
    return 0
  fi

  # Stage 3: real JSON parsing, mode + cursor filtering, and text
  # extraction — every matched file handled in a single jq process
  # instead of one process per recording.
  local matches
  matches="$(printf '%s\n' "$good_candidates" | xargs jq -r \
    --arg mode "$MODE_NAME" \
    --arg cursor "$cursor" \
    '
    select(.modeName == $mode) |
    (.datetime // "" | sub("T"; " ") | .[0:19]) as $dt |
    select($dt != "") |
    select($cursor == "" or $dt > $cursor) |
    ((.llmResult // "") | gsub("^\\s+|\\s+$"; "")) as $llm |
    ((.result // .rawResult // "") | gsub("^\\s+|\\s+$"; "")) as $raw |
    (if ($llm | length) > 0 then $llm else $raw end) as $text0 |
    ($text0 | gsub("[\\t\\n\\r]+"; " ") | gsub("^\\s+|\\s+$"; "")) as $text |
    select(($text | length) > 0) |
    "\($dt)\t\($text)"
    ' 2>/dev/null)"

  if [ -z "$matches" ]; then
    log "[$(date '+%Y-%m-%d %H:%M:%S')] No new recordings for mode \"$MODE_NAME\"."
    return 0
  fi

  local count=0
  while IFS=$'\t' read -r dt text; do
    {
      echo ""
      echo "[$dt]"
      echo "$text"
    } >> "$OUTPUT_FILE"
    count=$((count + 1))
  done < <(printf '%s\n' "$matches" | sort)

  log "[$(date '+%Y-%m-%d %H:%M:%S')] Appended $count new recording(s) from mode \"$MODE_NAME\" to $OUTPUT_FILE"
}

# ---- Optional companion viewer ----------------------------------------

VIEWER_PID=""

# Only ever called from the --watch dispatch below (poll or event), never
# for a one-shot run — a live viewer wouldn't make sense for a single pass.
maybe_launch_viewer() {
  [ "$WITH_VIEWER" -eq 1 ] || return 0

  local script_dir viewer_path
  script_dir="$(resolve_script_dir)"
  viewer_path="$script_dir/captainslog-viewer.py"

  if [ ! -f "$viewer_path" ]; then
    log "--with-viewer was set, but captainslog-viewer.py isn't next to this script — skipping."
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    log "--with-viewer was set, but python3 isn't available — skipping."
    return 0
  fi

  local viewer_args=("$viewer_path" "$OUTPUT_FILE")
  [ "$QUIET" -eq 1 ] && viewer_args+=(-q)

  python3 "${viewer_args[@]}" &
  VIEWER_PID=$!
  log "Also started the viewer (pid $VIEWER_PID), watching the same file."
}

stop_viewer() {
  [ -n "$VIEWER_PID" ] && kill "$VIEWER_PID" 2>/dev/null
}

# ---- Run modes -------------------------------------------------------

poll_mode() {
  local interval="$1"
  log "Polling every ${interval}s (mode: \"$MODE_NAME\", file: $OUTPUT_FILE). Press Ctrl-C to stop."
  trap 'log ""; log "Stopped."; stop_viewer; exit 0' INT TERM
  while true; do
    run_once
    sleep "$interval"
  done
}

event_mode() {
  if ! command -v fswatch >/dev/null 2>&1; then
    log "fswatch not found — falling back to polling every ${DEFAULT_POLL_FALLBACK}s. Install with: brew install fswatch"
    poll_mode "$DEFAULT_POLL_FALLBACK"
    return
  fi

  # A plain `fswatch ... | while read; do run_once; done` pipeline looks
  # simpler, but a trap set before an infinite pipeline like that doesn't
  # actually fire on SIGINT/SIGTERM until the pipeline itself ends — and
  # fswatch never ends on its own, so Ctrl-C / kill would silently do
  # nothing (confirmed this while testing). Running fswatch in the
  # background and having the main loop block on a FIFO `read` instead
  # keeps the shell itself responsive to signals immediately.
  local fifo
  fifo="$(mktemp -u)"
  mkfifo "$fifo"

  local fswatch_pid=""
  cleanup_event() {
    log ""
    log "Stopped."
    [ -n "$fswatch_pid" ] && kill "$fswatch_pid" 2>/dev/null
    stop_viewer
    rm -f "$fifo"
    exit 0
  }
  trap cleanup_event INT TERM

  fswatch -o -l 1.0 "$RECORDINGS_DIR" > "$fifo" &
  fswatch_pid=$!

  log "Watching for changes via fswatch (mode: \"$MODE_NAME\", file: $OUTPUT_FILE). Press Ctrl-C to stop."
  run_once # catch up on anything that happened before we started watching
  while true; do
    read -r _ < "$fifo"
    run_once
  done
}

# ---- Run once, poll, or watch ----------------------------------------

case "$WATCH_MODE" in
  none)
    run_once
    ;;
  poll)
    maybe_launch_viewer
    poll_mode "$INTERVAL"
    ;;
  event)
    maybe_launch_viewer
    event_mode
    ;;
esac
