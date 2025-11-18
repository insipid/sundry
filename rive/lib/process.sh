#!/usr/bin/env bash
# Process management for rive CLI

# Start server process
start_server() {
    local port="$1"
    local worktree="$2"
    local command_template="$RIVE_SERVER_COMMAND"

    # Validate port is numeric
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        error_exit 40 "Invalid port number: $port"
    fi

    # Replace %PORT% placeholder
    local command="${command_template//%PORT%/$port}"

    log_info "Starting server on port $port"
    log_debug "Command: $command"
    log_debug "Working directory: $worktree"

    # Start server in background
    cd "$worktree" || error_exit 40 "Failed to change to worktree directory"

    # Start process and capture PID
    nohup bash -c "$command" > /dev/null 2>&1 &
    local pid=$!

    log_info "Server started with PID $pid"

    # Wait briefly and verify process is still running
    sleep 2
    if ! ps -p "$pid" >/dev/null 2>&1; then
        error_exit 40 "Server process died immediately after start"
    fi

    echo "$pid"
    return 0
}

# Stop server process
stop_server() {
    local pid="$1"

    if [[ -z "$pid" ]]; then
        log_debug "No PID provided"
        return 0
    fi

    if ! ps -p "$pid" >/dev/null 2>&1; then
        log_debug "Process $pid is not running"
        return 0
    fi

    log_info "Stopping server (PID $pid)"

    # Try graceful shutdown first
    kill -TERM "$pid" 2>/dev/null || true

    # Wait up to 10 seconds
    local waited=0
    while ps -p "$pid" >/dev/null 2>&1 && (( waited < 10 )); do
        sleep 1
        waited=$((waited + 1))
    done

    # Force kill if still running
    if ps -p "$pid" >/dev/null 2>&1; then
        log_warning "Forcing server shutdown"
        kill -KILL "$pid" 2>/dev/null || true
        sleep 1
    fi

    if ps -p "$pid" >/dev/null 2>&1; then
        log_error "Failed to stop server"
        return 1
    else
        log_info "Server stopped successfully"
        return 0
    fi
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
    local now=$(date +%s)
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
restart_server() {
    local branch="$1"
    local app=$(state_get_app "$branch")

    if [[ -z "$app" ]]; then
        error_exit 1 "Review app not found: $branch"
    fi

    local port=$(parse_state_line "$app" "port")
    local worktree=$(parse_state_line "$app" "worktree")
    local pid=$(parse_state_line "$app" "pid")

    # Stop existing server
    stop_server "$pid"

    # Start new server
    local new_pid=$(start_server "$port" "$worktree")

    # Update state
    state_remove_app "$branch"
    state_add_app "$branch" "$port" "$worktree" "$new_pid"

    log_success "Review app restarted: $branch"
}
