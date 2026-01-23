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

# Get worktree path for a branch if it exists
get_worktree_for_branch() {
    local branch="$1"

    # List all worktrees and find the one for this branch
    git worktree list --porcelain | awk -v branch="$branch" '
        /^worktree / { path = substr($0, 10) }
        /^branch / {
            if (substr($0, 8) == "refs/heads/" branch) {
                print path
                exit
            }
        }
    '
}

# Interactive branch selection with FZF or numbered menu
select_branch_interactive() {
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null)

    # Get all local branches
    local branches
    branches=$(git branch --format='%(refname:short)' | sort)

    if [[ -z "$branches" ]]; then
        log_error "No branches found in repository"
        return 1
    fi

    # Build branch info with worktree status
    local branch_info=()
    local branch_list=()

    # Build branch-to-path map by calling git worktree list once
    declare -A worktree_map
    local current_path=""
    local branch_name=""
    while IFS= read -r line; do
        if [[ "$line" == worktree* ]]; then
            # Start of a new worktree entry - save previous mapping if available
            if [[ -n "$current_path" && -n "$branch_name" ]]; then
                worktree_map["$branch_name"]="$current_path"
            fi
            # Reset and set new path
            current_path="${line#worktree }"
            branch_name=""
        elif [[ "$line" == branch* ]]; then
            # Extract branch name only if it's a proper branch ref
            local ref="${line#branch }"
            if [[ "$ref" == refs/heads/* ]]; then
                branch_name="${ref#refs/heads/}"
            fi
        fi
    done < <(git worktree list --porcelain)
    # Handle the last entry
    if [[ -n "$current_path" && -n "$branch_name" ]]; then
        worktree_map["$branch_name"]="$current_path"
    fi

    while IFS= read -r branch; do
        local info="$branch"

        # Mark current branch
        if [[ "$branch" == "$current_branch" ]]; then
            info="$info (current)"
        fi

        # Mark if has worktree (lookup from map)
        if [[ -n "${worktree_map[$branch]}" ]]; then
            info="$info [worktree: ${worktree_map[$branch]}]"
        fi

        branch_info+=("$info")
        branch_list+=("$branch")
    done <<< "$branches"

    # Try to use FZF if available
    if command_exists fzf; then
        log_info "Select a branch (use arrow keys, type to filter):"
        local selected_info
        selected_info=$(printf '%s\n' "${branch_info[@]}" | fzf --height=40% --reverse --prompt="Select branch: ")

        if [[ -z "$selected_info" ]]; then
            log_error "No branch selected"
            return 1
        fi

        # Extract branch name (first word)
        echo "$selected_info" | awk '{print $1}'
        return 0
    else
        # Fallback to numbered menu
        echo ""
        log_info "Available branches:"
        echo ""

        local i=1
        for info in "${branch_info[@]}"; do
            printf "  %2d) %s\n" "$i" "$info"
            ((i++))
        done

        echo ""
        printf "Select branch number (1-%d): " "${#branch_list[@]}"
        read -r selection

        # Validate selection
        if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ "$selection" -lt 1 ]] || [[ "$selection" -gt "${#branch_list[@]}" ]]; then
            log_error "Invalid selection: $selection"
            return 1
        fi

        # Return selected branch (array is 0-indexed)
        echo "${branch_list[$((selection - 1))]}"
        return 0
    fi
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
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null)
    if [[ "$current_branch" == "$branch" ]]; then
        log_error "Branch '$branch' is currently checked out in the main working directory"
        log_error "Git cannot create a worktree for a branch that is already checked out"
        log_error "Please switch to a different branch first:"
        log_error "  git checkout main"
        log_error "  rive create $branch"
        return 1
    fi

    # Get repository name for namespacing
    local repo_name
    repo_name=$(get_repo_name)
    log_debug "Repository name: $repo_name"

    # Generate worktree path with repo namespace
    local sanitized
    sanitized=$(sanitize_branch_name "$branch")
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
