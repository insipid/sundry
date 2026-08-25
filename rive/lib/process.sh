#!/usr/bin/env bash
# Process management for rive CLI

# Launches the server command detached and in a NEW PROCESS GROUP, printing the
# group leader's PID.
#
# The group is what makes a server reliably stoppable. `bash -c "$command"` is
# only a wrapper: for a command like `npm run dev -- --port 40000`, the process
# actually bound to the port is a grandchild, so signalling the wrapper alone
# leaves it orphaned and still holding the port - which then breaks the next
# start with a port collision.
#
# Enabling job control with `set -m` makes bash put the background job into its
# own process group, and a group's ID is by definition the PID of its leader.
# So the PID rive already records doubles as the group ID, and stopping the
# whole tree needs no extra state. `setsid` would be the obvious tool for this,
# but macOS does not ship it.
spawn_server_process_group() {
    local command="$1"
    local output="$2"

    ( set -m; nohup bash -c "$command" > "$output" 2>&1 & echo $! )
}

# Start server process
start_server() {
    local port="$1"
    local worktree="$2"
    local command_template="$RIVE_SERVER_COMMAND"

    # Validate port is numeric
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        log_error "Invalid port number: $port"
        return 1
    fi

    # Replace %PORT% and %HOSTNAME% placeholders
    local command="${command_template//%PORT%/$port}"
    command="${command//%HOSTNAME%/$RIVE_HOSTNAME}"

    log_info "Starting server on port $port"
    log_debug "Command: $command"
    log_debug "Working directory: $worktree"

    # Start server in background
    if ! cd "$worktree"; then
        log_error "Failed to change to worktree directory: $worktree"
        return 1
    fi

    # Start process and capture PID
    local pid
    if [[ "${RIVE_ENABLE_LOGS:-false}" == "true" ]] || [[ "${RIVE_VERBOSE:-false}" == "true" ]]; then
        # When logging is enabled, redirect output to log file
        local log_file="$worktree/.rive-server.log"
        if [[ "${RIVE_VERBOSE:-false}" == "true" ]]; then
            log_debug "Executing command in worktree..."
            log_debug "$ cd $worktree && $command"
        fi
        log_info "Server output will be logged to: $log_file"
        pid=$(spawn_server_process_group "$command" "$log_file")
    else
        # In normal mode without logging, suppress output
        pid=$(spawn_server_process_group "$command" /dev/null)
    fi

    log_info "Server started with PID $pid"

    # Wait briefly and verify process is still running
    sleep 2
    if ! ps -p "$pid" >/dev/null 2>&1; then
        log_error "Server process died immediately after start"
        log_error "This usually means the server command failed"
        log_error "Check: RIVE_SERVER_COMMAND='$RIVE_SERVER_COMMAND'"
        log_error "You can test the command manually in: $worktree"
        return 1
    fi

    echo "$pid"
    return 0
}

# Signals every process in the server's group.
#
# Falls back to the bare PID when the group does not exist, which is the case
# for state entries written before rive launched servers in their own group -
# there the recorded PID leads no group at all.
signal_server_tree() {
    local pid="$1"
    local signal="$2"

    kill -"$signal" -"$pid" 2>/dev/null \
        || kill -"$signal" "$pid" 2>/dev/null \
        || true
}

# True while the recorded process, or anything else sharing its process group,
# is still alive. Both halves matter: the wrapper can exit while a stubborn
# child lingers, and for a pre-group state entry the PID leads no group.
server_tree_alive() {
    local pid="$1"

    if ps -p "$pid" >/dev/null 2>&1; then
        return 0
    fi

    ps -ax -o pgid= 2>/dev/null | tr -d ' ' | grep -qx "$pid"
}

# Last line of defence after the group has been signalled: a server that
# daemonised itself out of the process group would otherwise keep the port and
# break the next start.
#
# Only ever called on the path where a live server was just signalled, so
# anything still on the port a moment later is our own orphan rather than an
# unrelated service that happens to use it.
release_port_stragglers() {
    local port="${1:-}"

    if [[ -z "$port" ]] || ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi

    local stragglers
    stragglers=$(lsof -ti "tcp:$port" 2>/dev/null || true)
    if [[ -z "$stragglers" ]]; then
        return 0
    fi

    log_warning "Port $port still held after shutdown by PID(s): $(echo "$stragglers" | tr '\n' ' ')"
    log_warning "Releasing the port"
    # shellcheck disable=SC2086  # deliberate splitting: one PID per line
    kill -TERM $stragglers 2>/dev/null || true
    sleep 1

    stragglers=$(lsof -ti "tcp:$port" 2>/dev/null || true)
    if [[ -n "$stragglers" ]]; then
        # shellcheck disable=SC2086  # deliberate splitting: one PID per line
        kill -KILL $stragglers 2>/dev/null || true
    fi

    return 0
}

# Stop a server and everything it spawned.
#
# The port is optional but should be passed whenever it is known: it is what
# lets the shutdown be verified rather than assumed.
stop_server() {
    local pid="$1"
    local port="${2:-}"

    if [[ -z "$pid" ]]; then
        log_debug "No PID provided"
        return 0
    fi

    if is_stopped_pid "$pid"; then
        log_debug "App is already stopped"
        return 0
    fi

    if ! server_tree_alive "$pid"; then
        log_debug "Process $pid is not running"
        return 0
    fi

    log_info "Stopping server (PID $pid)"

    # Try graceful shutdown of the whole group first
    signal_server_tree "$pid" TERM

    # Wait up to 10 seconds
    local waited=0
    while server_tree_alive "$pid" && (( waited < 10 )); do
        sleep 1
        waited=$((waited + 1))
    done

    # Force kill if still running
    if server_tree_alive "$pid"; then
        log_warning "Forcing server shutdown"
        signal_server_tree "$pid" KILL
        sleep 1
    fi

    if server_tree_alive "$pid"; then
        log_error "Failed to stop server"
        return 1
    fi

    release_port_stragglers "$port"

    log_info "Server stopped successfully"
    return 0
}

# Get process status
get_process_status() {
    local pid="$1"

    if [[ -z "$pid" ]]; then
        echo "unknown"
        return 1
    fi

    if ps -p "$pid" >/dev/null 2>&1; then
        echo "running"
        return 0
    else
        echo "stopped"
        return 1
    fi
}

# Calculate uptime from timestamp
calculate_uptime() {
    local start_time="$1"
    local now
    now=$(date +%s)
    local uptime_seconds=$((now - start_time))

    local days=$((uptime_seconds / 86400))
    local hours=$(((uptime_seconds % 86400) / 3600))
    local minutes=$(((uptime_seconds % 3600) / 60))

    if (( days > 0 )); then
        echo "${days}d ${hours}h ${minutes}m"
    elif (( hours > 0 )); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Restart server process
#
# Takes a branch or a port, the same as the other lookup commands. The branch
# is then read back off the state line, so everything below works from the
# resolved app rather than from whichever identifier the caller happened to use.
restart_server() {
    local identifier="$1"

    # resolve_app handles branch, port and repo:branch forms, and honours the
    # current scope, so restart resolves an app exactly like every other
    # lookup command. It reports the reason itself when nothing matches.
    local app
    app=$(resolve_app "$identifier" "${RIVE_SCOPE:-local}") || exit 1

    local branch port worktree pid repo
    branch=$(parse_state_line "$app" "branch")
    port=$(parse_state_line "$app" "port")
    worktree=$(parse_state_line "$app" "worktree")
    pid=$(parse_state_line "$app" "pid")
    repo=$(parse_state_line "$app" "repo")

    # Stop existing server
    stop_server "$pid" "$port"

    # Start new server
    local new_pid
    if ! new_pid=$(start_server "$port" "$worktree"); then
        log_error "Failed to start server during restart"
        log_error "Previous server was stopped but new server failed to start"
        log_error "Worktree is still available at: $worktree"
        # Remove stale state since server is no longer running
        state_remove_app "$branch" "$repo"
        return 1
    fi

    # Verify we got a valid PID
    if [[ -z "$new_pid" ]] || ! [[ "$new_pid" =~ ^[0-9]+$ ]]; then
        log_error "Server start returned invalid PID: '$new_pid'"
        state_remove_app "$branch" "$repo"
        return 1
    fi

    # Update state with new PID, keeping it attributed to the same repository
    state_remove_app "$branch" "$repo"
    state_add_app "$branch" "$port" "$worktree" "$new_pid" "$repo"

    log_success "Review app restarted: $branch"
}
