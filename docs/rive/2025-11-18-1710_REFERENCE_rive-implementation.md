# Rive CLI - Implementation Guide

## Project Structure

```
rive/
├── bin/
│   └── rive                    # Main executable script
├── lib/
│   ├── config.sh              # Configuration management
│   ├── state.sh               # State file management
│   ├── worktree.sh            # Git worktree operations
│   ├── port.sh                # Port allocation
│   ├── process.sh             # Process management
│   └── utils.sh               # Utility functions
├── tests/
│   ├── unit/
│   │   ├── test_config.sh
│   │   ├── test_state.sh
│   │   ├── test_worktree.sh
│   │   ├── test_port.sh
│   │   └── test_process.sh
│   └── integration/
│       ├── test_create.sh
│       ├── test_stop.sh
│       ├── test_list.sh
│       └── test_restart.sh
├── docs/
│   └── ...                     # Documentation files
├── examples/
│   ├── .env.example
│   └── hooks/
├── LICENSE
└── README.md
```

## Development Setup

### Prerequisites

```bash
# Install required tools
sudo apt-get install git bash lsof jq

# Or on macOS
brew install git bash lsof jq
```

### Clone and Install

```bash
# Clone repository
git clone https://github.com/example/rive.git
cd rive

# Make executable
chmod +x bin/rive

# Link to local bin (optional)
ln -s $(pwd)/bin/rive /usr/local/bin/rive

# Or add to PATH
export PATH="$(pwd)/bin:$PATH"
```

### Development Environment

```bash
# Create development configuration
cp examples/.env.example .env

# Edit for your environment
vim .env

# Run in development mode
./bin/rive --verbose create test/branch
```

## Module Implementation

### 1. Configuration Module (lib/config.sh)

**Purpose:** Load and merge configuration from multiple sources.

```bash
#!/usr/bin/env bash
# lib/config.sh

# Default configuration values
declare -A RIVE_CONFIG=(
    [START_PORT]=40000
    [END_PORT]=49999
    [WORKTREE_DIR]="$HOME/.rive/worktrees"
    [STATE_FILE]="$HOME/.rive/state.json"
    [LOG_DIR]="$HOME/.rive/logs"
    [SERVER_COMMAND]="npm run dev -- --port %PORT%"
    [AUTO_INSTALL]=false
    [AUTO_CLEANUP]=false
    [GIT_FETCH]=true
    [TIMEOUT]=30
    [HEALTH_CHECK_URL]="/"
    [VERBOSE]=false
)

# Load environment variables
load_env_vars() {
    for key in "${!RIVE_CONFIG[@]}"; do
        local env_var="RIVE_${key}"
        if [ -n "${!env_var}" ]; then
            RIVE_CONFIG[$key]="${!env_var}"
            log_debug "Loaded $key from environment: ${RIVE_CONFIG[$key]}"
        fi
    done
}

# Load .env file
load_env_file() {
    local env_file="${1:-.env}"

    if [ ! -f "$env_file" ]; then
        log_debug "No .env file found at $env_file"
        return 0
    fi

    log_debug "Loading configuration from $env_file"

    # Parse .env file
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue

        # Remove RIVE_ prefix if present
        key="${key#RIVE_}"

        # Remove quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"

        # Set configuration
        if [[ -v RIVE_CONFIG[$key] ]]; then
            RIVE_CONFIG[$key]="$value"
            log_debug "Loaded $key from .env: $value"
        fi
    done < "$env_file"
}

# Parse CLI arguments
parse_cli_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --start-port)
                RIVE_CONFIG[START_PORT]="$2"
                shift 2
                ;;
            --end-port)
                RIVE_CONFIG[END_PORT]="$2"
                shift 2
                ;;
            --worktree-dir)
                RIVE_CONFIG[WORKTREE_DIR]="$2"
                shift 2
                ;;
            --auto-install)
                RIVE_CONFIG[AUTO_INSTALL]=true
                shift
                ;;
            --no-auto-install)
                RIVE_CONFIG[AUTO_INSTALL]=false
                shift
                ;;
            --cleanup)
                RIVE_CONFIG[AUTO_CLEANUP]=true
                shift
                ;;
            --no-cleanup)
                RIVE_CONFIG[AUTO_CLEANUP]=false
                shift
                ;;
            --verbose|-v)
                RIVE_CONFIG[VERBOSE]=true
                shift
                ;;
            *)
                # Not a configuration flag, return to caller
                break
                ;;
        esac
    done
}

# Validate configuration
validate_config() {
    local errors=0

    # Validate port range
    if [[ ! "${RIVE_CONFIG[START_PORT]}" =~ ^[0-9]+$ ]]; then
        log_error "RIVE_START_PORT must be numeric"
        ((errors++))
    elif (( RIVE_CONFIG[START_PORT] < 1024 || RIVE_CONFIG[START_PORT] > 65535 )); then
        log_error "RIVE_START_PORT must be between 1024 and 65535"
        ((errors++))
    fi

    if [[ ! "${RIVE_CONFIG[END_PORT]}" =~ ^[0-9]+$ ]]; then
        log_error "RIVE_END_PORT must be numeric"
        ((errors++))
    elif (( RIVE_CONFIG[END_PORT] < 1024 || RIVE_CONFIG[END_PORT] > 65535 )); then
        log_error "RIVE_END_PORT must be between 1024 and 65535"
        ((errors++))
    fi

    if (( RIVE_CONFIG[START_PORT] >= RIVE_CONFIG[END_PORT] )); then
        log_error "RIVE_START_PORT must be less than RIVE_END_PORT"
        ((errors++))
    fi

    # Validate paths
    if [[ "${RIVE_CONFIG[WORKTREE_DIR]}" != /* ]]; then
        log_error "RIVE_WORKTREE_DIR must be an absolute path"
        ((errors++))
    fi

    # Validate server command
    if [[ ! "${RIVE_CONFIG[SERVER_COMMAND]}" =~ %PORT% ]]; then
        log_error "RIVE_SERVER_COMMAND must contain %PORT% placeholder"
        ((errors++))
    fi

    return $errors
}

# Initialize configuration
init_config() {
    load_env_vars
    load_env_file
    parse_cli_args "$@"
    validate_config
}
```

### 2. State Management Module (lib/state.sh)

**Purpose:** Manage persistent state of running review apps.

```bash
#!/usr/bin/env bash
# lib/state.sh

# Initialize state file
init_state_file() {
    local state_file="${RIVE_CONFIG[STATE_FILE]}"
    local state_dir=$(dirname "$state_file")

    # Create directory if needed
    if [ ! -d "$state_dir" ]; then
        mkdir -p "$state_dir" || {
            log_error "Failed to create state directory: $state_dir"
            return 1
        }
    fi

    # Create empty state if needed
    if [ ! -f "$state_file" ]; then
        echo '{"version":"1.0","apps":{}}' > "$state_file" || {
            log_error "Failed to create state file: $state_file"
            return 1
        }
    fi

    return 0
}

# Acquire exclusive lock on state file
lock_state() {
    local lock_file="/var/lock/rive-${USER}.lock"
    local lock_fd=200

    # Create lock file
    eval "exec $lock_fd>$lock_file"

    # Acquire exclusive lock (wait up to 10 seconds)
    if ! flock -x -w 10 $lock_fd; then
        log_error "Failed to acquire state file lock"
        return 1
    fi

    log_debug "Acquired state file lock"
    return 0
}

# Release lock on state file
unlock_state() {
    local lock_fd=200
    flock -u $lock_fd
    log_debug "Released state file lock"
}

# Read state file
read_state() {
    local state_file="${RIVE_CONFIG[STATE_FILE]}"
    cat "$state_file"
}

# Write state file
write_state() {
    local state_file="${RIVE_CONFIG[STATE_FILE]}"
    local state_data="$1"

    echo "$state_data" > "$state_file" || {
        log_error "Failed to write state file"
        return 1
    }

    return 0
}

# Add review app to state
state_add_app() {
    local branch="$1"
    local port="$2"
    local worktree="$3"
    local pid="$4"
    local command="$5"

    lock_state || return 1

    local state=$(read_state)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Add new app entry
    state=$(echo "$state" | jq \
        --arg branch "$branch" \
        --arg port "$port" \
        --arg worktree "$worktree" \
        --arg pid "$pid" \
        --arg command "$command" \
        --arg created "$timestamp" \
        --arg started "$timestamp" \
        '.apps[$branch] = {
            "branch": $branch,
            "port": ($port | tonumber),
            "worktree": $worktree,
            "pid": ($pid | tonumber),
            "command": $command,
            "created_at": $created,
            "started_at": $started,
            "status": "running"
        }')

    write_state "$state"
    local result=$?

    unlock_state
    return $result
}

# Remove review app from state
state_remove_app() {
    local branch="$1"

    lock_state || return 1

    local state=$(read_state)

    # Remove app entry
    state=$(echo "$state" | jq \
        --arg branch "$branch" \
        'del(.apps[$branch])')

    write_state "$state"
    local result=$?

    unlock_state
    return $result
}

# Get review app by branch
state_get_app() {
    local branch="$1"
    local state=$(read_state)

    echo "$state" | jq -r \
        --arg branch "$branch" \
        '.apps[$branch] // empty'
}

# Get review app by port
state_get_app_by_port() {
    local port="$1"
    local state=$(read_state)

    echo "$state" | jq -r \
        --arg port "$port" \
        '.apps[] | select(.port == ($port | tonumber))'
}

# List all review apps
state_list_apps() {
    local state=$(read_state)
    echo "$state" | jq -r '.apps | keys[]'
}

# Check if branch has a review app
state_has_app() {
    local branch="$1"
    local app=$(state_get_app "$branch")

    if [ -n "$app" ]; then
        return 0
    else
        return 1
    fi
}
```

### 3. Port Management Module (lib/port.sh)

**Purpose:** Find and allocate available ports.

```bash
#!/usr/bin/env bash
# lib/port.sh

# Check if port is in use by system
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

    if [ -n "$app" ]; then
        # Check if process is actually running
        local pid=$(echo "$app" | jq -r '.pid')
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

# Find first available port in range
find_available_port() {
    local start_port="${RIVE_CONFIG[START_PORT]}"
    local end_port="${RIVE_CONFIG[END_PORT]}"
    local current_port=$start_port

    log_debug "Searching for available port in range $start_port-$end_port"

    while (( current_port <= end_port )); do
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

    if [ -n "$app" ]; then
        echo "$app" | jq -r '.port'
        return 0
    else
        return 1
    fi
}
```

### 4. Worktree Management Module (lib/worktree.sh)

**Purpose:** Create and manage git worktrees.

```bash
#!/usr/bin/env bash
# lib/worktree.sh

# Sanitize branch name for use as directory name
sanitize_branch_name() {
    local branch="$1"

    # Convert to lowercase, replace / with -, remove special chars
    echo "$branch" | \
        tr '[:upper:]' '[:lower:]' | \
        sed 's/\//-/g' | \
        sed 's/[^a-z0-9-]//g'
}

# Validate branch exists
validate_branch() {
    local branch="$1"

    # Fetch latest if configured
    if [ "${RIVE_CONFIG[GIT_FETCH]}" = "true" ]; then
        log_info "Fetching latest changes..."
        git fetch origin >/dev/null 2>&1
    fi

    # Check if branch exists locally or remotely
    if git rev-parse --verify "$branch" >/dev/null 2>&1 || \
       git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
        return 0
    else
        log_error "Branch not found: $branch"
        return 1
    fi
}

# Create git worktree
create_worktree() {
    local branch="$1"
    local base_dir="${RIVE_CONFIG[WORKTREE_DIR]}"

    # Validate branch
    validate_branch "$branch" || return 1

    # Generate worktree path
    local sanitized=$(sanitize_branch_name "$branch")
    local worktree_path="$base_dir/$sanitized"

    # Check if worktree already exists
    if [ -d "$worktree_path" ]; then
        log_warning "Worktree already exists at $worktree_path"
        echo "$worktree_path"
        return 0
    fi

    # Create base directory if needed
    if [ ! -d "$base_dir" ]; then
        mkdir -p "$base_dir" || {
            log_error "Failed to create worktree base directory: $base_dir"
            return 1
        }
    fi

    # Create worktree
    log_info "Creating worktree at $worktree_path"
    if git worktree add "$worktree_path" "$branch" >/dev/null 2>&1; then
        log_info "Worktree created successfully"
        echo "$worktree_path"
        return 0
    else
        log_error "Failed to create worktree"
        return 1
    fi
}

# Remove git worktree
remove_worktree() {
    local worktree_path="$1"

    if [ ! -d "$worktree_path" ]; then
        log_debug "Worktree does not exist: $worktree_path"
        return 0
    fi

    log_info "Removing worktree at $worktree_path"
    if git worktree remove "$worktree_path" --force >/dev/null 2>&1; then
        log_info "Worktree removed successfully"
        return 0
    else
        log_error "Failed to remove worktree"
        return 1
    fi
}

# Install dependencies in worktree
install_dependencies() {
    local worktree_path="$1"

    if [ "${RIVE_CONFIG[AUTO_INSTALL]}" != "true" ]; then
        log_debug "Auto-install is disabled"
        return 0
    fi

    log_info "Installing dependencies..."

    cd "$worktree_path" || return 1

    # Auto-detect package manager
    local install_cmd="${RIVE_CONFIG[INSTALL_COMMAND]}"

    if [ -z "$install_cmd" ]; then
        if [ -f "package-lock.json" ]; then
            install_cmd="npm install"
        elif [ -f "yarn.lock" ]; then
            install_cmd="yarn install"
        elif [ -f "pnpm-lock.yaml" ]; then
            install_cmd="pnpm install"
        elif [ -f "requirements.txt" ]; then
            install_cmd="pip install -r requirements.txt"
        elif [ -f "Gemfile" ]; then
            install_cmd="bundle install"
        else
            log_warning "Could not auto-detect dependency manager"
            return 0
        fi
    fi

    log_info "Running: $install_cmd"
    if eval "$install_cmd" >/dev/null 2>&1; then
        log_info "Dependencies installed successfully"
        return 0
    else
        log_error "Failed to install dependencies"
        return 1
    fi
}
```

### 5. Process Management Module (lib/process.sh)

**Purpose:** Start, stop, and monitor server processes.

```bash
#!/usr/bin/env bash
# lib/process.sh

# Start server process
start_server() {
    local port="$1"
    local worktree="$2"
    local command_template="${RIVE_CONFIG[SERVER_COMMAND]}"

    # Replace %PORT% placeholder
    local command="${command_template//%PORT%/$port}"

    log_info "Starting server on port $port"
    log_debug "Command: $command"

    # Prepare log files
    local log_dir="${RIVE_CONFIG[LOG_DIR]}"
    local branch_sanitized=$(basename "$worktree")
    local stdout_log="$log_dir/$branch_sanitized.log"
    local stderr_log="$log_dir/$branch_sanitized.err"

    mkdir -p "$log_dir"

    # Start server in background
    cd "$worktree" || return 1
    nohup bash -c "$command" > "$stdout_log" 2> "$stderr_log" &
    local pid=$!

    log_info "Server started with PID $pid"

    # Wait briefly and verify process is still running
    sleep 2
    if ! ps -p "$pid" >/dev/null 2>&1; then
        log_error "Server process died immediately"
        log_error "Check logs: $stderr_log"
        return 1
    fi

    # Perform health check
    if ! wait_for_server "$port"; then
        log_error "Server failed health check"
        kill "$pid" 2>/dev/null
        return 1
    fi

    echo "$pid"
    return 0
}

# Wait for server to be ready
wait_for_server() {
    local port="$1"
    local timeout="${RIVE_CONFIG[TIMEOUT]}"
    local health_url="${RIVE_CONFIG[HEALTH_CHECK_URL]}"
    local url="http://localhost:$port$health_url"
    local elapsed=0

    log_info "Waiting for server to be ready..."

    while (( elapsed < timeout )); do
        if curl -s -f "$url" >/dev/null 2>&1; then
            log_info "Server is ready"
            return 0
        fi

        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Server did not become ready within ${timeout}s"
    return 1
}

# Stop server process
stop_server() {
    local pid="$1"

    if [ -z "$pid" ]; then
        log_debug "No PID provided"
        return 0
    fi

    if ! ps -p "$pid" >/dev/null 2>&1; then
        log_debug "Process $pid is not running"
        return 0
    fi

    log_info "Stopping server (PID $pid)"

    # Try graceful shutdown first
    kill -TERM "$pid" 2>/dev/null

    # Wait up to 10 seconds
    local waited=0
    while ps -p "$pid" >/dev/null 2>&1 && (( waited < 10 )); do
        sleep 1
        waited=$((waited + 1))
    done

    # Force kill if still running
    if ps -p "$pid" >/dev/null 2>&1; then
        log_warning "Forcing server shutdown"
        kill -KILL "$pid" 2>/dev/null
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

    if [ -z "$pid" ]; then
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

# Calculate uptime
calculate_uptime() {
    local started_at="$1"
    local now=$(date +%s)
    local start=$(date -d "$started_at" +%s 2>/dev/null || echo "$now")
    local uptime_seconds=$((now - start))

    local hours=$((uptime_seconds / 3600))
    local minutes=$(((uptime_seconds % 3600) / 60))

    if (( hours > 0 )); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}
```

## Main Script Implementation

The main `bin/rive` script ties all modules together:

```bash
#!/usr/bin/env bash
# bin/rive

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source library modules
source "$LIB_DIR/utils.sh"
source "$LIB_DIR/config.sh"
source "$LIB_DIR/state.sh"
source "$LIB_DIR/port.sh"
source "$LIB_DIR/worktree.sh"
source "$LIB_DIR/process.sh"

# Command: create
cmd_create() {
    local branch="$1"

    # Check if review app already exists
    if state_has_app "$branch"; then
        log_error "Review app already exists for branch: $branch"
        return 1
    fi

    # Find available port
    local port=$(find_available_port) || {
        log_error "Could not allocate port"
        return 1
    }

    # Create worktree
    local worktree=$(create_worktree "$branch") || {
        log_error "Failed to create worktree"
        return 1
    }

    # Install dependencies
    install_dependencies "$worktree" || {
        log_warning "Dependency installation failed, continuing..."
    }

    # Start server
    local pid=$(start_server "$port" "$worktree") || {
        log_error "Failed to start server"
        remove_worktree "$worktree"
        return 1
    }

    # Save state
    state_add_app "$branch" "$port" "$worktree" "$pid" "${RIVE_CONFIG[SERVER_COMMAND]}" || {
        log_error "Failed to save state"
        stop_server "$pid"
        remove_worktree "$worktree"
        return 1
    }

    # Success message
    log_success "Review app created successfully!"
    echo ""
    echo "  Branch:   $branch"
    echo "  Port:     $port"
    echo "  URL:      http://localhost:$port"
    echo "  Worktree: $worktree"
    echo ""
}

# Command: list
cmd_list() {
    # Print header
    printf "%-30s %-8s %-30s %-10s %-10s\n" \
        "BRANCH" "PORT" "WORKTREE" "STATUS" "UPTIME"
    printf "%-30s %-8s %-30s %-10s %-10s\n" \
        "$(printf '%.0s─' {1..30})" \
        "$(printf '%.0s─' {1..8})" \
        "$(printf '%.0s─' {1..30})" \
        "$(printf '%.0s─' {1..10})" \
        "$(printf '%.0s─' {1..10})"

    # List all apps
    for branch in $(state_list_apps); do
        local app=$(state_get_app "$branch")
        local port=$(echo "$app" | jq -r '.port')
        local worktree=$(echo "$app" | jq -r '.worktree')
        local pid=$(echo "$app" | jq -r '.pid')
        local started_at=$(echo "$app" | jq -r '.started_at')

        local status=$(get_process_status "$pid")
        local uptime=$(calculate_uptime "$started_at")

        printf "%-30s %-8s %-30s %-10s %-10s\n" \
            "$branch" "$port" "$worktree" "$status" "$uptime"
    done
}

# Command: stop
cmd_stop() {
    local identifier="$1"

    # Try to find by branch first
    local app=$(state_get_app "$identifier")

    # If not found, try by port
    if [ -z "$app" ]; then
        app=$(state_get_app_by_port "$identifier")
    fi

    if [ -z "$app" ]; then
        log_error "Review app not found: $identifier"
        return 1
    fi

    local branch=$(echo "$app" | jq -r '.branch')
    local pid=$(echo "$app" | jq -r '.pid')
    local worktree=$(echo "$app" | jq -r '.worktree')

    # Stop server
    stop_server "$pid"

    # Remove from state
    state_remove_app "$branch"

    # Optionally remove worktree
    if [ "${RIVE_CONFIG[AUTO_CLEANUP]}" = "true" ]; then
        remove_worktree "$worktree"
    fi

    log_success "Review app stopped: $branch"
}

# Main entry point
main() {
    # Initialize configuration
    init_config "$@"

    # Initialize state
    init_state_file

    # Parse command
    local command="${1:-}"

    case "$command" in
        create)
            shift
            cmd_create "$@"
            ;;
        list)
            cmd_list
            ;;
        stop)
            shift
            cmd_stop "$@"
            ;;
        --version|-v)
            echo "rive version 1.0.0"
            ;;
        --help|-h|"")
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
```

## Testing

### Unit Test Example

```bash
#!/usr/bin/env bash
# tests/unit/test_port.sh

source "$(dirname "$0")/../../lib/port.sh"
source "$(dirname "$0")/test_helpers.sh"

test_is_port_in_use() {
    # Start a test server
    python3 -m http.server 8888 >/dev/null 2>&1 &
    local pid=$!

    # Wait for server to start
    sleep 1

    # Test
    if is_port_in_use 8888; then
        pass "Port 8888 correctly detected as in use"
    else
        fail "Port 8888 should be in use"
    fi

    # Cleanup
    kill $pid

    # Test available port
    if ! is_port_in_use 8889; then
        pass "Port 8889 correctly detected as available"
    else
        fail "Port 8889 should be available"
    fi
}

test_find_available_port() {
    RIVE_CONFIG[START_PORT]=40000
    RIVE_CONFIG[END_PORT]=40010

    local port=$(find_available_port)

    if [ -n "$port" ]; then
        pass "Found available port: $port"
    else
        fail "Should find available port"
    fi

    if (( port >= 40000 && port <= 40010 )); then
        pass "Port is in configured range"
    else
        fail "Port should be in range 40000-40010"
    fi
}

# Run tests
run_tests
```

## Installation Script

```bash
#!/usr/bin/env bash
# install.sh

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
REPO_URL="https://github.com/example/rive.git"

echo "Installing Rive CLI..."

# Clone repository
if [ ! -d "/tmp/rive" ]; then
    git clone "$REPO_URL" /tmp/rive
fi

cd /tmp/rive

# Make executable
chmod +x bin/rive

# Install to system
sudo cp bin/rive "$INSTALL_DIR/rive"
sudo mkdir -p "$INSTALL_DIR/../lib/rive"
sudo cp -r lib/* "$INSTALL_DIR/../lib/rive/"

echo "Rive installed successfully to $INSTALL_DIR/rive"
echo "Run 'rive --help' to get started"
```

## Release Checklist

Before releasing a new version:

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Version bumped in main script
- [ ] CHANGELOG updated
- [ ] Security audit completed
- [ ] Cross-platform testing (Linux, macOS)
- [ ] Performance benchmarks run
- [ ] Example configurations tested
- [ ] Installation script tested
- [ ] Git tag created
- [ ] GitHub release created
