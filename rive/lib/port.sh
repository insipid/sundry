#!/usr/bin/env bash
# Port management for rive CLI

# Check if port is in use by the system
is_port_in_use() {
    local port="$1"

    # Use lsof to check if port is in use
    if lsof -i ":$port" >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is available
    fi
}

# Check if port is allocated to a review app
is_port_allocated() {
    local port="$1"
    local app=$(state_get_app_by_port "$port")

    if [[ -n "$app" ]]; then
        local pid=$(parse_state_line "$app" "pid")

        # Check if process is actually running
        if ps -p "$pid" >/dev/null 2>&1; then
            return 0  # Port is allocated and process is running
        else
            # Process is dead, port is not really allocated
            return 1
        fi
    else
        return 1  # Port is not allocated
    fi
}

# Find first available port
find_available_port() {
    local start_port="$RIVE_START_PORT"
    local end_port=$((start_port + 1000))  # Search up to 1000 ports
    local current_port=$start_port

    log_debug "Searching for available port starting from $start_port"

    while (( current_port < end_port )); do
        log_debug "Checking port $current_port"

        if ! is_port_in_use "$current_port" && ! is_port_allocated "$current_port"; then
            log_debug "Found available port: $current_port"
            echo "$current_port"
            return 0
        fi

        current_port=$((current_port + 1))
    done

    log_error "No available ports in range $start_port-$end_port"
    return 1
}

# Get port for a specific branch
get_port_for_branch() {
    local branch="$1"
    local app=$(state_get_app "$branch")

    if [[ -n "$app" ]]; then
        parse_state_line "$app" "port"
        return 0
    else
        return 1
    fi
}
