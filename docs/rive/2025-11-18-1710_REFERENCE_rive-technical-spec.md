# Rive CLI - Technical Specification

## System Architecture

### Overview

Rive is implemented as a POSIX-compliant Bash script that orchestrates git worktrees, process management, and port allocation for ephemeral review applications.

### Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                      Rive CLI                            │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐ │
│  │          Configuration Manager                     │ │
│  │  - Parse CLI args                                  │ │
│  │  - Load .env file                                  │ │
│  │  - Merge environment variables                     │ │
│  │  - Apply precedence rules                          │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────┐       │
│  │          State Manager                       │       │
│  │  - Track running review apps                │       │
│  │  - Persist process metadata                 │       │
│  │  - Handle state file locking                │       │
│  │  - Query and update app status              │       │
│  └─────────────────────────────────────────────┘       │
│             │                    │                       │
│   ┌─────────┴────────┐  ┌────────┴─────────┐           │
│   ▼                  │  │                  ▼            │
│  ┌──────────────┐    │  │    ┌──────────────────┐      │
│  │   Worktree   │    │  │    │  Port Manager    │      │
│  │   Manager    │    │  │    │  - Scan range    │      │
│  │  - Create    │    │  │    │  - Check avail.  │      │
│  │  - Remove    │    │  │    │  - Allocate      │      │
│  │  - Validate  │    │  │    │  - Release       │      │
│  └──────────────┘    │  │    └──────────────────┘      │
│                      │  │                               │
│                      ▼  ▼                               │
│          ┌────────────────────────┐                     │
│          │   Process Manager      │                     │
│          │   - Start server       │                     │
│          │   - Stop server        │                     │
│          │   - Monitor status     │                     │
│          │   - Restart server     │                     │
│          └────────────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

## Data Storage

### State File Format

Rive maintains a state file at `~/.rive/state.json` (or `$RIVE_STATE_FILE`):

```json
{
  "version": "1.0",
  "apps": {
    "feature/user-auth": {
      "branch": "feature/user-auth",
      "port": 40000,
      "worktree": "/tmp/rive-worktrees/user-auth",
      "pid": 12345,
      "created_at": "2025-11-18T17:10:00Z",
      "started_at": "2025-11-18T17:10:05Z",
      "status": "running",
      "command": "npm run dev -- --port 40000"
    }
  }
}
```

### File Locking

To prevent race conditions when multiple rive instances run simultaneously:

```bash
# Acquire lock
exec 200>/var/lock/rive.lock
flock -x 200

# Perform operations
# ...

# Release lock
flock -u 200
```

## Core Algorithms

### Port Allocation Algorithm

```bash
find_available_port() {
    local start_port=$1
    local end_port=$2
    local current_port=$start_port

    while [ $current_port -le $end_port ]; do
        # Check if port is in use by system
        if ! lsof -i :$current_port >/dev/null 2>&1; then
            # Check if port is allocated to another review app
            if ! is_port_allocated $current_port; then
                echo $current_port
                return 0
            fi
        fi
        current_port=$((current_port + 1))
    done

    return 1  # No available port found
}
```

**Time Complexity:** O(n) where n = (end_port - start_port)
**Space Complexity:** O(1)

### Worktree Path Sanitization

```bash
sanitize_branch_name() {
    local branch=$1
    # Convert to lowercase, replace / with -, remove special chars
    echo "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/\//-/g' | sed 's/[^a-z0-9-]//g'
}

# Example: feature/User-Auth_v2 → feature-user-auth-v2
```

### Process Status Detection

```bash
check_process_status() {
    local pid=$1

    if [ -z "$pid" ]; then
        echo "unknown"
        return 1
    fi

    if ps -p $pid > /dev/null 2>&1; then
        echo "running"
        return 0
    else
        echo "stopped"
        return 1
    fi
}
```

## Command Implementation Details

### Create Command Flow

```
┌─────────────────────────────────────────────┐
│ 1. Parse CLI arguments and load config     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 2. Validate branch exists                  │
│    git rev-parse --verify <branch>         │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 3. Check if review app already exists      │
│    Query state file for branch             │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 4. Find available port                      │
│    Scan from START_PORT to END_PORT        │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 5. Create worktree                          │
│    git worktree add <path> <branch>        │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 6. Install dependencies (if needed)         │
│    Run post-checkout hooks                  │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 7. Start server process                     │
│    Replace %PORT% in SERVER_COMMAND        │
│    Launch in background                     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 8. Save state to state file                │
│    Store: branch, port, pid, worktree      │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 9. Display success message                  │
│    Show: branch, port, URL, worktree path  │
└─────────────────────────────────────────────┘
```

### List Command Flow

```bash
list_review_apps() {
    # Read state file
    local state=$(cat ~/.rive/state.json)

    # Print header
    printf "%-30s %-8s %-30s %-10s %-10s\n" \
        "BRANCH" "PORT" "WORKTREE" "STATUS" "UPTIME"

    # Iterate over apps
    for app in $(echo "$state" | jq -r '.apps | keys[]'); do
        local branch=$(echo "$state" | jq -r ".apps[\"$app\"].branch")
        local port=$(echo "$state" | jq -r ".apps[\"$app\"].port")
        local worktree=$(echo "$state" | jq -r ".apps[\"$app\"].worktree")
        local pid=$(echo "$state" | jq -r ".apps[\"$app\"].pid")
        local started_at=$(echo "$state" | jq -r ".apps[\"$app\"].started_at")

        # Check actual process status
        local status=$(check_process_status $pid)

        # Calculate uptime
        local uptime=$(calculate_uptime "$started_at")

        # Print row
        printf "%-30s %-8s %-30s %-10s %-10s\n" \
            "$branch" "$port" "$worktree" "$status" "$uptime"
    done
}
```

### Stop Command Flow

```
┌─────────────────────────────────────────────┐
│ 1. Parse branch/port argument              │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 2. Lookup review app in state file         │
│    Match by branch name or port number     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 3. Terminate server process                 │
│    kill -TERM <pid>                         │
│    Wait up to 10s, then kill -KILL         │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 4. Optional: Remove worktree                │
│    git worktree remove <path>              │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 5. Update state file                        │
│    Remove app entry or mark as stopped     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 6. Display confirmation message             │
└─────────────────────────────────────────────┘
```

## Error Handling

### Error Categories

1. **Configuration Errors**
   - Missing required configuration
   - Invalid configuration values
   - Conflicting configuration sources

2. **Git Errors**
   - Branch not found
   - Worktree creation failed
   - Repository not clean

3. **System Errors**
   - Port allocation failed
   - Process launch failed
   - Insufficient permissions

4. **State Errors**
   - Corrupted state file
   - File locking timeout
   - Concurrent modification

### Error Response Format

```bash
error_exit() {
    local code=$1
    local message=$2

    echo "Error [$code]: $message" >&2

    case $code in
        ERR_CONFIG)
            echo "Check your configuration in .env or environment variables" >&2
            exit 10
            ;;
        ERR_GIT)
            echo "Git operation failed. Check branch name and repository state" >&2
            exit 20
            ;;
        ERR_PORT)
            echo "Could not allocate port. Try different port range" >&2
            exit 30
            ;;
        ERR_PROCESS)
            echo "Server process failed. Check logs in worktree directory" >&2
            exit 40
            ;;
        *)
            exit 1
            ;;
    esac
}
```

### Exit Codes

| Code | Category | Description |
|------|----------|-------------|
| 0    | Success  | Operation completed successfully |
| 1    | General  | General error |
| 10   | Config   | Configuration error |
| 20   | Git      | Git operation failed |
| 30   | Port     | Port allocation failed |
| 40   | Process  | Server process error |
| 50   | State    | State file error |

## Security Considerations

### Input Validation

All user inputs must be validated:

```bash
validate_branch_name() {
    local branch=$1

    # Prevent path traversal
    if [[ "$branch" =~ \.\. ]]; then
        error_exit ERR_CONFIG "Invalid branch name: contains '..'"
    fi

    # Prevent command injection
    if [[ "$branch" =~ [\;\|\&\$\`] ]]; then
        error_exit ERR_CONFIG "Invalid branch name: contains special characters"
    fi

    # Verify branch exists in git
    if ! git rev-parse --verify "$branch" >/dev/null 2>&1; then
        error_exit ERR_GIT "Branch not found: $branch"
    fi
}
```

### Command Injection Prevention

When executing user-configured commands:

```bash
start_server() {
    local port=$1
    local worktree=$2
    local command=$3

    # Escape port number (should be numeric only)
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        error_exit ERR_PORT "Invalid port number: $port"
    fi

    # Use printf to safely substitute port
    local safe_command=$(printf "%s" "$command" | sed "s/%PORT%/$port/g")

    # Execute in subshell with restricted environment
    cd "$worktree" && exec bash -c "$safe_command" &
    local pid=$!
    echo $pid
}
```

### File System Safety

```bash
create_worktree() {
    local branch=$1
    local base_dir=$2

    # Ensure base directory is absolute path
    if [[ "$base_dir" != /* ]]; then
        error_exit ERR_CONFIG "Worktree directory must be absolute path"
    fi

    # Ensure base directory exists and is writable
    if [ ! -d "$base_dir" ] || [ ! -w "$base_dir" ]; then
        error_exit ERR_CONFIG "Worktree directory not accessible: $base_dir"
    fi

    # Create worktree with safe path
    local sanitized=$(sanitize_branch_name "$branch")
    local worktree_path="$base_dir/$sanitized"

    git worktree add "$worktree_path" "$branch"
}
```

## Performance Considerations

### Optimization Strategies

1. **Port Scanning**
   - Use binary search for large port ranges
   - Cache recently allocated ports
   - Parallel port availability checks

2. **State File Management**
   - Use memory-mapped files for large state
   - Implement incremental updates
   - Compress historical data

3. **Worktree Creation**
   - Use shallow clones when appropriate
   - Implement sparse checkout for monorepos
   - Parallel dependency installation

### Benchmarks

Expected performance on modern hardware:

| Operation | Time | Notes |
|-----------|------|-------|
| Create review app | 5-15s | Depends on dependency installation |
| List review apps | <100ms | For <100 apps |
| Stop review app | <1s | Graceful shutdown |
| Port scan (100 ports) | <500ms | Using lsof |

## Testing Strategy

### Unit Tests

Test individual functions:

```bash
test_sanitize_branch_name() {
    assert_equals "feature-user-auth" $(sanitize_branch_name "feature/User-Auth")
    assert_equals "bugfix-login" $(sanitize_branch_name "bugfix/login!@#")
}

test_find_available_port() {
    local port=$(find_available_port 40000 40100)
    assert_not_empty "$port"
    assert_greater_than "$port" 39999
    assert_less_than "$port" 40101
}
```

### Integration Tests

Test command workflows:

```bash
test_create_and_stop() {
    # Create review app
    rive create test/branch

    # Verify it's running
    assert_contains "test/branch" "$(rive list)"

    # Stop review app
    rive stop test/branch

    # Verify it's stopped
    assert_not_contains "test/branch" "$(rive list)"
}
```

### Edge Cases

- Multiple simultaneous creates
- Stopping non-existent apps
- Restarting crashed servers
- Handling corrupted state files
- Recovery from partial operations

## Dependencies

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| bash | 4.0+ | Script interpreter |
| git | 2.5+ | Worktree management |
| lsof | Any | Port checking |
| jq | 1.5+ | JSON parsing (optional) |
| flock | Any | File locking |

### Optional Tools

| Tool | Purpose |
|------|---------|
| jq | Better JSON handling |
| netstat | Alternative to lsof |
| ss | Alternative to lsof |

## Future Enhancements

### Potential Features

1. **Web Dashboard**
   - Visual interface for managing review apps
   - Real-time status monitoring
   - Log streaming

2. **Docker Integration**
   - Containerized review apps
   - Multi-service support
   - Resource limits

3. **Cloud Deployment**
   - Deploy review apps to cloud providers
   - DNS management
   - SSL certificates

4. **Collaboration Features**
   - Share review apps across team
   - Access control
   - Usage analytics

5. **Advanced Process Management**
   - Automatic restart on crash
   - Health checks
   - Resource monitoring
