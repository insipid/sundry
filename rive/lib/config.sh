#!/usr/bin/env bash
# Configuration management for rive CLI

# Default configuration values
RIVE_START_PORT="${RIVE_START_PORT:-40000}"
RIVE_WORKTREE_DIR="${RIVE_WORKTREE_DIR:-$HOME/.rive/worktrees}"
RIVE_SERVER_COMMAND="${RIVE_SERVER_COMMAND:-npm run dev -- --port %PORT%}"
RIVE_STATE_FILE="${RIVE_STATE_FILE:-$HOME/.rive/state}"
RIVE_AUTO_INSTALL="${RIVE_AUTO_INSTALL:-false}"
RIVE_INSTALL_COMMAND="${RIVE_INSTALL_COMMAND:-}"
RIVE_VERBOSE="${RIVE_VERBOSE:-false}"

# Load .env file if it exists
load_env_file() {
    local env_file="${1:-.env}"

    if [[ ! -f "$env_file" ]]; then
        log_debug "No .env file found at $env_file"
        return 0
    fi

    log_debug "Loading configuration from $env_file"

    # Source the .env file in a safe way
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue

        # Remove leading/trailing whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)

        # Remove quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"

        # Export if it's a RIVE_ variable
        if [[ "$key" =~ ^RIVE_ ]]; then
            export "$key=$value"
            log_debug "Loaded $key from .env"
        fi
    done < "$env_file"

    # Update variables with .env values
    RIVE_START_PORT="${RIVE_START_PORT:-40000}"
    RIVE_WORKTREE_DIR="${RIVE_WORKTREE_DIR:-$HOME/.rive/worktrees}"
    RIVE_SERVER_COMMAND="${RIVE_SERVER_COMMAND:-npm run dev -- --port %PORT%}"
    RIVE_STATE_FILE="${RIVE_STATE_FILE:-$HOME/.rive/state}"
    RIVE_AUTO_INSTALL="${RIVE_AUTO_INSTALL:-false}"
    RIVE_INSTALL_COMMAND="${RIVE_INSTALL_COMMAND:-}"

    return 0
}

# Validate configuration
validate_config() {
    local errors=0

    # Validate port
    if ! [[ "$RIVE_START_PORT" =~ ^[0-9]+$ ]]; then
        log_error "RIVE_START_PORT must be numeric, got: $RIVE_START_PORT"
        ((errors++))
    elif (( RIVE_START_PORT < 1024 || RIVE_START_PORT > 65535 )); then
        log_error "RIVE_START_PORT must be between 1024 and 65535"
        ((errors++))
    fi

    # Validate worktree directory is absolute
    if [[ ! "$RIVE_WORKTREE_DIR" =~ ^/ ]]; then
        log_error "RIVE_WORKTREE_DIR must be an absolute path"
        ((errors++))
    fi

    # Validate server command contains %PORT%
    if [[ ! "$RIVE_SERVER_COMMAND" =~ %PORT% ]]; then
        log_error "RIVE_SERVER_COMMAND must contain %PORT% placeholder"
        ((errors++))
    fi

    if (( errors > 0 )); then
        return 1
    fi

    return 0
}

# Initialize configuration
init_config() {
    # Load .env file first (lower precedence)
    load_env_file

    # Environment variables are already loaded (medium precedence)
    # CLI flags will override later (highest precedence)

    # Validate configuration
    validate_config || error_exit 10 "Configuration validation failed"

    log_debug "Configuration initialized:"
    log_debug "  RIVE_START_PORT=$RIVE_START_PORT"
    log_debug "  RIVE_WORKTREE_DIR=$RIVE_WORKTREE_DIR"
    log_debug "  RIVE_SERVER_COMMAND=$RIVE_SERVER_COMMAND"
    log_debug "  RIVE_STATE_FILE=$RIVE_STATE_FILE"
}

# Show current configuration
show_config() {
    echo "Current Configuration:"
    echo "  RIVE_START_PORT=$RIVE_START_PORT"
    echo "  RIVE_WORKTREE_DIR=$RIVE_WORKTREE_DIR"
    echo "  RIVE_SERVER_COMMAND=$RIVE_SERVER_COMMAND"
    echo "  RIVE_STATE_FILE=$RIVE_STATE_FILE"
    echo "  RIVE_AUTO_INSTALL=$RIVE_AUTO_INSTALL"
    echo "  RIVE_VERBOSE=$RIVE_VERBOSE"
}
