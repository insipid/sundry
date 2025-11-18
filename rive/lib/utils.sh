#!/usr/bin/env bash
# Utility functions for rive CLI

# Color codes for output
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    NC=''
fi

# Logging functions
log_error() {
    echo -e "${RED}Error:${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}Warning:${NC} $*" >&2
}

log_info() {
    echo -e "${BLUE}Info:${NC} $*"
}

log_success() {
    echo -e "${GREEN}Success:${NC} $*"
}

log_debug() {
    if [[ "${RIVE_VERBOSE:-false}" == "true" ]]; then
        echo -e "${CYAN}Debug:${NC} $*" >&2
    fi
}

# Error exit function
error_exit() {
    local code=${1:-1}
    local message=${2:-"Unknown error"}

    log_error "$message"
    exit "$code"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required dependencies
check_dependencies() {
    local missing=()

    if ! command_exists git; then
        missing+=("git")
    fi

    if ! command_exists lsof; then
        missing+=("lsof")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing[*]}"
        log_info "Please install the missing dependencies and try again"
        return 1
    fi

    return 0
}

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        error_exit 1 "Not in a git repository"
    fi
}

# Validate branch name for security
validate_branch_name() {
    local branch="$1"

    # Prevent path traversal
    if [[ "$branch" =~ \.\. ]]; then
        error_exit 10 "Invalid branch name: contains '..'"
    fi

    # Prevent command injection
    if [[ "$branch" =~ [\;\|\&\$\`] ]]; then
        error_exit 10 "Invalid branch name: contains special characters"
    fi

    return 0
}

# Sanitize branch name for use as directory name
sanitize_branch_name() {
    local branch="$1"

    # Convert to lowercase, replace / with -, remove special chars
    echo "$branch" | \
        tr '[:upper:]' '[:lower:]' | \
        sed 's/\//-/g' | \
        sed 's/[^a-z0-9-]//g'
}
