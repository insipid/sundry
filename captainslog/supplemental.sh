#!/bin/bash
#
# supplemental.sh — append one VoiceInk transcription to a captainslog-style text file.
#
# Usage:
#   supplemental.sh [output-file]
#
# Meant to be run by VoiceInk itself, as the command it runs after each
# recording — not by hand (though running it by hand is how you test it).
# VoiceInk hands over the transcript in $VOICEINK_TRANSCRIPT; this writes it
# as one entry in exactly the format captainslog.sh uses:
#
#   [YYYY-MM-DD HH:MM:SS]
#   The transcript text.
#
# so captainslog-viewer.py can serve the resulting file unchanged.
#
# Every setting can come from, in priority order: a command-line argument,
# then an environment variable, then a built-in default — same convention
# as captainslog.sh.
#
#   argument         env var                         default
#   ---------------  ------------------------------  ------------------------------
#   output-file      CAPTAINSLOG_SUPPLEMENTAL_FILE   ~/Documents/voiceink-notes.txt
#   (none)           VOICEINK_TRANSCRIPT             (set by VoiceInk — required)
#
# Behavior:
#   - Push, not pull. VoiceInk runs this once per recording, so there's no
#     recordings folder to scan, no cursor, and no --watch — every run
#     appends exactly one entry (or none, if the transcript is empty).
#   - The timestamp is when this runs, i.e. when VoiceInk finished the
#     recording — VoiceInk doesn't pass one of its own.
#   - Deliberately NOT CAPTAINSLOG_FILE. That's the Superwhisper log's
#     variable; if it's exported in your shell, a test run of this script
#     from a terminal would otherwise quietly write into the Superwhisper
#     log. Each source keeps its own file.
#   - VoiceInk runs this without your shell profile, so anything exported
#     in ~/.zshrc (including CAPTAINSLOG_SUPPLEMENTAL_FILE) won't be set
#     when VoiceInk calls it. Pass the output file as an argument in
#     VoiceInk's command if you don't want the default.
#
# Stock bash only — no jq, no fswatch.

set -u

OUTPUT_FILE="$HOME/Documents/voiceink-notes.txt"
[ -n "${CAPTAINSLOG_SUPPLEMENTAL_FILE:-}" ] && OUTPUT_FILE="$CAPTAINSLOG_SUPPLEMENTAL_FILE"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [output-file]

  Appends the transcript in \$VOICEINK_TRANSCRIPT to output-file as one
  timestamped entry, in the same format captainslog.sh writes. Meant to be
  the command VoiceInk runs after each recording.

  output-file    Where the entry gets appended.
                 Default: \$CAPTAINSLOG_SUPPLEMENTAL_FILE, or ~/Documents/voiceink-notes.txt

  Test by hand:  VOICEINK_TRANSCRIPT="Testing, one two." $(basename "$0") /tmp/test.txt
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage; exit 0 ;;
    *)
      OUTPUT_FILE="$1"; shift ;;
  esac
done

# Same flattening captainslog.sh applies: runs of tabs/newlines become a
# single space, then leading/trailing whitespace is trimmed — so one
# recording is always exactly one line under its stamp.
text="$(printf '%s' "${VOICEINK_TRANSCRIPT:-}" | tr -s '\t\n\r' ' ' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

# Nothing said (or run without VoiceInk) — nothing to log.
[ -n "$text" ] || exit 0

mkdir -p "$(dirname "$OUTPUT_FILE")" || exit 1

{
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')]"
  printf '%s\n' "$text"
} >> "$OUTPUT_FILE" || { echo "ERROR: couldn't write to $OUTPUT_FILE" >&2; exit 1; }
