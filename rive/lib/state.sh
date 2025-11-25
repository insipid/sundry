#!/usr/bin/env bash
# State management for rive CLI

# Current app file location
RIVE_CURRENT_FILE="${RIVE_CURRENT_FILE:-$HOME/.rive/current}"

# Initialize state file
init_state_file() {
    local state_file="$RIVE_STATE_FILE"
    local state_dir=$(dirname "$state_file")

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

    local state_file="$RIVE_STATE_FILE"
    local timestamp=$(date +%s)

    # Format: branch|port|worktree|pid|timestamp
    echo "$branch|$port|$worktree|$pid|$timestamp" >> "$state_file"

    log_debug "Added app to state: $branch on port $port"
    return 0
}

# Remove review app from state
state_remove_app() {
    local branch="$1"
    local state_file="$RIVE_STATE_FILE"
    local temp_file="${state_file}.tmp"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    # Remove lines matching the branch
    grep -v "^${branch}|" "$state_file" > "$temp_file" || true
    mv "$temp_file" "$state_file"

    log_debug "Removed app from state: $branch"
    return 0
}

# Get review app by branch
state_get_app() {
    local branch="$1"
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 1
    fi

    grep "^${branch}|" "$state_file" | head -1
}

# Get review app by port
state_get_app_by_port() {
    local port="$1"
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 1
    fi

    grep "|${port}|" "$state_file" | head -1
}

# List all review apps
state_list_apps() {
    local state_file="$RIVE_STATE_FILE"

    if [[ ! -f "$state_file" ]]; then
        return 0
    fi

    cat "$state_file"
}

# Check if branch has a review app
state_has_app() {
    local branch="$1"
    local app=$(state_get_app "$branch")

    if [[ -n "$app" ]]; then
        return 0
    else
        return 1
    fi
}

# Parse state line
parse_state_line() {
    local line="$1"
    local field="${2:-branch}"

    IFS='|' read -r branch port worktree pid timestamp <<< "$line"

    case "$field" in
        branch) echo "$branch" ;;
        port) echo "$port" ;;
        worktree) echo "$worktree" ;;
        pid) echo "$pid" ;;
        timestamp) echo "$timestamp" ;;
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

    > "$temp_file"

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        local pid=$(parse_state_line "$line" "pid")

        # Keep the entry if process is still running
        if ps -p "$pid" >/dev/null 2>&1; then
            echo "$line" >> "$temp_file"
        else
            local branch=$(parse_state_line "$line" "branch")
            log_debug "Removing stale entry for $branch (PID $pid no longer running)"
        fi
    done < "$state_file"

    mv "$temp_file" "$state_file"
}

# Set current app
set_current_app() {
    local identifier="$1"

    # Validate that the app exists
    local app=$(state_get_app "$identifier")
    if [[ -z "$app" ]]; then
        app=$(state_get_app_by_port "$identifier")
    fi

    if [[ -z "$app" ]]; then
        return 1
    fi

    # Get the branch name to store
    local branch=$(parse_state_line "$app" "branch")

    # Write to current file
    echo "$branch" > "$RIVE_CURRENT_FILE"
    log_debug "Set current app to: $branch"
    return 0
}

# Get current app identifier
get_current_app() {
    # Check environment variable first
    if [[ -n "${RIVE_CURRENT_APP:-}" ]]; then
        echo "$RIVE_CURRENT_APP"
        return 0
    fi

    # Check current file
    if [[ -f "$RIVE_CURRENT_FILE" ]]; then
        cat "$RIVE_CURRENT_FILE"
        return 0
    fi

    return 1
}

# Clear current app
clear_current_app() {
    if [[ -f "$RIVE_CURRENT_FILE" ]]; then
        rm "$RIVE_CURRENT_FILE"
    fi
    log_debug "Cleared current app"
    return 0
}
