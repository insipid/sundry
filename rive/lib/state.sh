#!/usr/bin/env bash
# State management for rive CLI

# Current app file location
RIVE_CURRENT_FILE="${RIVE_CURRENT_FILE:-$HOME/.rive/current}"

# Initialize state file
init_state_file() {
    local state_file="$RIVE_STATE_FILE"
    local state_dir
    state_dir=$(dirname "$state_file")

    # Create directory if needed
    if [[ ! -d "$state_dir" ]]; then
        mkdir -p "$state_dir" || {
            error_exit 50 "Failed to create state directory: $state_dir"
        }
    fi

    # Create empty state if needed
    if [[ ! -f "$state_file" ]]; then
        touch "$state_file" || {
            error_exit 50 "Failed to create state file: $state_file"
        }
    fi

    return 0
}

# Add review app to state
state_add_app() {
    local branch="$1"
    local port="$2"
    local worktree="$3"
    local pid="$4"
    local repo="${5:-}"

    local state_file="$RIVE_STATE_FILE"
    local timestamp
    timestamp=$(date +%s)

    # The repo is normally supplied by the caller; fall back to deriving it so
    # that direct callers (and tests) cannot write an unattributed entry.
    if [[ -z "$repo" ]]; then
        repo=$(repo_key_for_worktree "$worktree")
    fi

    # Format: branch|port|worktree|pid|timestamp|repo
    echo "$branch|$port|$worktree|$pid|$timestamp|$repo" >> "$state_file"

    log_debug "Added app to state: $branch on port $port ($repo)"
    return 0
}

# Remove review app from state
# Removes one app. Keyed on (repo, branch): the same branch name can be running
# in several repositories, and removing one must not remove the others. Passing
# no repo removes every entry for that branch, whatever repository it is in.
state_remove_app() {
    local branch="$1"
    local repo="${2:-}"
    local state_file="$RIVE_STATE_FILE"
    local temp_file="${state_file}.tmp"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    local line line_branch line_repo
    : > "$temp_file"
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        line_branch=$(parse_state_line "$line" "branch")
        line_repo=$(parse_state_line "$line" "repo")

        if [[ "$line_branch" == "$branch" ]]; then
            if [[ -z "$repo" || "$line_repo" == "$repo" ]]; then
                continue
            fi
        fi
        echo "$line" >> "$temp_file"
    done < "$state_file"
    mv "$temp_file" "$state_file"

    log_debug "Removed app from state: $branch${repo:+ ($repo)}"
    return 0
}

# Get review app by branch
#
# "Not found" is signalled by empty output, never by a non-zero exit. Callers
# assign the result with `app=$(state_get_app "$x")`, and bin/rive runs under
# `set -e`, so returning non-zero here aborted the whole command silently -
# which is what broke every lookup by port: the branch lookup is tried first,
# finds nothing, and the script died before the port lookup could run.
state_get_app() {
    local branch="$1"
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    grep "^${branch}|" "$state_file" | head -1 || true
}

# Get review app by port. Empty output means not found; see state_get_app.
state_get_app_by_port() {
    local port="$1"
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    grep "|${port}|" "$state_file" | head -1 || true
}

# List all review apps, in every repository
state_list_apps() {
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    cat "$state_file"
}

# List review apps belonging to one repository
state_list_apps_in_repo() {
    local repo="$1"
    local line

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        if [[ "$(parse_state_line "$line" "repo")" == "$repo" ]]; then
            echo "$line"
        fi
    done < <(state_list_apps)
}

# List apps the current scope should see
state_list_apps_in_scope() {
    local scope="$1"
    local repo

    if [[ "$scope" == "global" ]]; then
        state_list_apps
        return 0
    fi

    if repo=$(get_repo_key 2>/dev/null); then
        state_list_apps_in_repo "$repo"
    fi
}

# Entries written before repositories were tracked have no repo field. Derive
# it from the recorded worktree and rewrite them, so a user upgrading rive
# never has to migrate anything by hand.
state_backfill_repos() {
    local state_file="$RIVE_STATE_FILE"
    local temp_file="${state_file}.backfill"

    [[ -f "$state_file" ]] || return 0
    grep -q . "$state_file" 2>/dev/null || return 0

    # Nothing to do if every line already carries a repo
    local needs_backfill=0 line
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        if [[ -z "$(parse_state_line "$line" "repo")" ]]; then
            needs_backfill=1
            break
        fi
    done < "$state_file"
    [[ $needs_backfill -eq 1 ]] || return 0

    log_debug "Backfilling repository for legacy state entries"

    : > "$temp_file"
    local worktree repo
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        if [[ -n "$(parse_state_line "$line" "repo")" ]]; then
            echo "$line" >> "$temp_file"
            continue
        fi
        worktree=$(parse_state_line "$line" "worktree")
        repo=$(repo_key_for_worktree "$worktree")
        echo "${line}|${repo}" >> "$temp_file"
    done < "$state_file"
    mv "$temp_file" "$state_file"
}

# Check if branch has a review app
# True if this branch already has an app. With a repo, only that repository is
# consulted - the same branch name running elsewhere is not a conflict.
state_has_app() {
    local branch="$1"
    local repo="${2:-}"
    local line

    if [[ -z "$repo" ]]; then
        [[ -n "$(state_get_app "$branch")" ]]
        return
    fi

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        if [[ "$(parse_state_line "$line" "branch")" == "$branch" \
           && "$(parse_state_line "$line" "repo")" == "$repo" ]]; then
            return 0
        fi
    done < <(state_list_apps)

    return 1
}

# Parse state line
parse_state_line() {
    local line="$1"
    local field="${2:-branch}"

    IFS='|' read -r branch port worktree pid timestamp repo <<< "$line"

    case "$field" in
        branch) echo "$branch" ;;
        port) echo "$port" ;;
        worktree) echo "$worktree" ;;
        pid) echo "$pid" ;;
        timestamp) echo "$timestamp" ;;
        repo) echo "${repo:-}" ;;
        *) echo "" ;;
    esac
}

# Clean stale entries (processes that are no longer running)
state_clean_stale() {
    local state_file="$RIVE_STATE_FILE"
    local temp_file="${state_file}.tmp"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    : > "$temp_file"

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        local pid
        pid=$(parse_state_line "$line" "pid")

        # Keep the entry if process is still running
        if ps -p "$pid" >/dev/null 2>&1; then
            echo "$line" >> "$temp_file"
        else
            local branch
            branch=$(parse_state_line "$line" "branch")
            log_debug "Removing stale entry for $branch (PID $pid no longer running)"
        fi
    done < "$state_file"

    mv "$temp_file" "$state_file"
}

# Current app pointer
#
# One current app per repository, not one globally. A single global pointer
# stopped making sense once commands are repo-scoped: you could be standing in
# my-api with my-web's branch "current", and a bare `rive pull` would act on
# the wrong repository entirely.
#
# Stored one line per repository:  <repo-key>|<branch>
# A legacy file holds a single bare branch name and is migrated on first write.

# True if the file predates per-repo tracking (a lone branch name, no pipe)
current_file_is_legacy() {
    [[ -f "$RIVE_CURRENT_FILE" ]] || return 1
    grep -q '|' "$RIVE_CURRENT_FILE" 2>/dev/null && return 1
    grep -q . "$RIVE_CURRENT_FILE" 2>/dev/null
}

# Set current app for the repository the app belongs to
set_current_app() {
    local identifier="$1"

    # Prefer an app in the repository we are standing in. Matching on branch
    # name alone would pick whichever repo happened to be first in the state
    # file, so adding an app in one repo could silently retarget another
    # repo's current pointer.
    local app="" here line
    here=$(get_repo_key 2>/dev/null) || here=""

    if [[ -n "$here" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            if [[ "$(parse_state_line "$line" "branch")" == "$identifier" \
               && "$(parse_state_line "$line" "repo")" == "$here" ]]; then
                app="$line"
                break
            fi
        done < <(state_list_apps)
    fi

    if [[ -z "$app" ]]; then
        app=$(state_get_app "$identifier")
    fi
    if [[ -z "$app" ]]; then
        app=$(state_get_app_by_port "$identifier")
    fi

    if [[ -z "$app" ]]; then
        return 1
    fi

    local branch repo
    branch=$(parse_state_line "$app" "branch")
    repo=$(parse_state_line "$app" "repo")

    if [[ -z "$repo" ]]; then
        repo=$(get_repo_key 2>/dev/null) || repo=""
    fi

    local temp_file="${RIVE_CURRENT_FILE}.tmp"
    local line
    : > "$temp_file"

    # Carry over other repositories' pointers, dropping any legacy line and any
    # previous pointer for this repository
    if [[ -f "$RIVE_CURRENT_FILE" ]] && ! current_file_is_legacy; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            [[ "$line" == *"|"* ]] || continue
            [[ "${line%%|*}" == "$repo" ]] && continue
            echo "$line" >> "$temp_file"
        done < "$RIVE_CURRENT_FILE"
    fi

    echo "${repo}|${branch}" >> "$temp_file"
    mv "$temp_file" "$RIVE_CURRENT_FILE"

    log_debug "Set current app to: $branch ($repo)"
    return 0
}

# Get the current app for the repository we are standing in
get_current_app() {
    # Explicit override always wins
    if [[ -n "${RIVE_CURRENT_APP:-}" ]]; then
        echo "$RIVE_CURRENT_APP"
        return 0
    fi

    [[ -f "$RIVE_CURRENT_FILE" ]] || return 1

    # A pointer written by an older rive belongs to whichever repo the user was
    # in at the time; honour it rather than losing their context on upgrade.
    if current_file_is_legacy; then
        cat "$RIVE_CURRENT_FILE"
        return 0
    fi

    local repo line
    repo=$(get_repo_key 2>/dev/null) || repo=""

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ "$line" == *"|"* ]] || continue
        if [[ "${line%%|*}" == "$repo" ]]; then
            echo "${line#*|}"
            return 0
        fi
    done < "$RIVE_CURRENT_FILE"

    return 1
}

# Clear the current app for this repository, leaving other repositories alone
clear_current_app() {
    [[ -f "$RIVE_CURRENT_FILE" ]] || return 0

    if current_file_is_legacy; then
        rm -f "$RIVE_CURRENT_FILE"
        log_debug "Cleared current app (legacy pointer)"
        return 0
    fi

    local repo line temp_file="${RIVE_CURRENT_FILE}.tmp"
    repo=$(get_repo_key 2>/dev/null) || repo=""

    : > "$temp_file"
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        [[ "$line" == *"|"* ]] || continue
        [[ "${line%%|*}" == "$repo" ]] && continue
        echo "$line" >> "$temp_file"
    done < "$RIVE_CURRENT_FILE"

    if grep -q . "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$RIVE_CURRENT_FILE"
    else
        rm -f "$temp_file" "$RIVE_CURRENT_FILE"
    fi

    log_debug "Cleared current app"
    return 0
}
