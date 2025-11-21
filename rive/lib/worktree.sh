#!/usr/bin/env bash
# Worktree management for rive CLI

# Get repository name for namespacing worktrees
get_repo_name() {
    local repo_name

    # Use the git repository root directory name
    repo_name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")

    # Sanitize the repo name
    echo "$repo_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g'
}

# Validate branch exists
validate_branch() {
    local branch="$1"

    # Validate branch name for security
    validate_branch_name "$branch"

    # Check if branch exists locally
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        log_debug "Branch exists locally: $branch"
        return 0
    fi

    # Check if branch exists remotely
    if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
        log_debug "Branch exists remotely: origin/$branch"
        return 0
    fi

    # Try fetching latest branches
    log_info "Branch not found locally, fetching from remote..."
    if git fetch origin >/dev/null 2>&1; then
        # Check again after fetch
        if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
            log_debug "Branch found after fetch: origin/$branch"
            return 0
        fi
    fi

    log_error "Branch not found: $branch"
    return 1
}

# Create git worktree
create_worktree() {
    local branch="$1"
    local base_dir="$RIVE_WORKTREE_DIR"

    # Validate branch
    validate_branch "$branch" || return 1

    # Check if branch is currently checked out in main working directory
    local current_branch=$(git branch --show-current 2>/dev/null)
    if [[ "$current_branch" == "$branch" ]]; then
        log_error "Branch '$branch' is currently checked out in the main working directory"
        log_error "Git cannot create a worktree for a branch that is already checked out"
        log_error "Please switch to a different branch first:"
        log_error "  git checkout main"
        log_error "  rive create $branch"
        return 1
    fi

    # Get repository name for namespacing
    local repo_name=$(get_repo_name)
    log_debug "Repository name: $repo_name"

    # Generate worktree path with repo namespace
    local sanitized=$(sanitize_branch_name "$branch")
    local worktree_path="$base_dir/$repo_name/$sanitized"

    # Check if worktree already exists
    if [[ -d "$worktree_path" ]]; then
        log_warning "Worktree already exists at $worktree_path"
        echo "$worktree_path"
        return 0
    fi

    # Create repo-specific directory if needed
    local repo_dir="$base_dir/$repo_name"
    if [[ ! -d "$repo_dir" ]]; then
        mkdir -p "$repo_dir" || {
            error_exit 20 "Failed to create worktree directory: $repo_dir"
        }
    fi

    # Create worktree
    log_info "Creating worktree at $worktree_path"

    # Capture git worktree output
    local git_output
    if git_output=$(git worktree add "$worktree_path" "$branch" 2>&1); then
        log_debug "Worktree created successfully"

        # Check if the branch has an upstream configured in the main repo
        local upstream
        if upstream=$(git rev-parse --abbrev-ref "$branch@{upstream}" 2>/dev/null); then
            log_debug "Found upstream in main repo: $upstream"

            # Set the same upstream in the worktree
            (cd "$worktree_path" && git branch --set-upstream-to="$upstream" 2>&1) || {
                log_warning "Failed to set upstream branch"
            }

            # Fetch to ensure remote refs are available in worktree
            log_debug "Fetching remote refs for worktree"
            (cd "$worktree_path" && git fetch 2>&1) || {
                log_debug "Initial fetch failed, continuing anyway"
            }
        else
            log_debug "No upstream configured for branch in main repo"
        fi

        echo "$worktree_path"
        return 0
    else
        # Git command failed, show the error
        log_error "Git worktree creation failed:"
        echo "$git_output" | while IFS= read -r line; do
            log_error "  $line"
        done
        return 1
    fi
}

# Check if worktree has uncommitted changes
is_worktree_clean() {
    local worktree_path="$1"

    if [[ ! -d "$worktree_path" ]]; then
        return 0  # Doesn't exist, consider it clean
    fi

    # Check git status in the worktree, excluding .rive-server.log
    local status
    status=$(cd "$worktree_path" && git status --porcelain 2>/dev/null | grep -v '^?? \.rive-server\.log$')

    if [[ -z "$status" ]]; then
        return 0  # Clean
    else
        return 1  # Dirty
    fi
}

# Remove git worktree
remove_worktree() {
    local worktree_path="$1"

    if [[ ! -d "$worktree_path" ]]; then
        log_debug "Worktree does not exist: $worktree_path"
        return 0
    fi

    log_info "Removing worktree at $worktree_path"
    if git worktree remove "$worktree_path" --force >/dev/null 2>&1; then
        log_info "Worktree removed successfully"
        return 0
    else
        log_warning "Failed to remove worktree with git, trying manual cleanup"
        rm -rf "$worktree_path"
        git worktree prune >/dev/null 2>&1
        return 0
    fi
}

# Install dependencies in worktree
install_dependencies() {
    local worktree_path="$1"

    if [[ "$RIVE_AUTO_INSTALL" != "true" ]]; then
        log_debug "Auto-install is disabled"
        return 0
    fi

    log_info "Installing dependencies..."

    cd "$worktree_path" || return 1

    # Use custom install command if provided
    local install_cmd="$RIVE_INSTALL_COMMAND"

    # Auto-detect package manager if not specified
    if [[ -z "$install_cmd" ]]; then
        if [[ -f "package-lock.json" ]]; then
            install_cmd="npm install"
        elif [[ -f "yarn.lock" ]]; then
            install_cmd="yarn install"
        elif [[ -f "pnpm-lock.yaml" ]]; then
            install_cmd="pnpm install"
        elif [[ -f "requirements.txt" ]]; then
            install_cmd="pip install -r requirements.txt"
        elif [[ -f "Gemfile" ]]; then
            install_cmd="bundle install"
        else
            log_debug "Could not auto-detect dependency manager, skipping"
            return 0
        fi
    fi

    log_info "Running: $install_cmd"
    if eval "$install_cmd" >/dev/null 2>&1; then
        log_info "Dependencies installed successfully"
        return 0
    else
        log_warning "Failed to install dependencies, continuing anyway"
        return 0
    fi
}
