#!/usr/bin/env bash
# Repository scoping for rive CLI
#
# rive tracks every review app in one state file, but apps belong to different
# repositories. This module answers three questions:
#
#   1. Which repository am I standing in?      (get_repo_key)
#   2. Which apps should this command see?     (resolve_scope)
#   3. Which app does this identifier mean?    (resolve_app)
#
# Repositories are identified by the absolute, symlink-resolved path of their
# main working directory. Two checkouts that share a directory name - say
# ~/work/api and ~/oss/api - are therefore distinct, which the old
# basename-only identity could not express.

# Canonical key for the repository containing the current directory.
#
# The first entry of `git worktree list` is always the main working directory,
# so this returns the same key whether you are standing in the repo root or in
# one of its linked worktrees. Prints nothing and returns 1 outside a repo.
get_repo_key() {
    local main_worktree
    main_worktree=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')

    if [[ -z "$main_worktree" ]]; then
        return 1
    fi

    # Physicalise so /var/... and /private/var/... never look like two repos
    (cd -P "$main_worktree" 2>/dev/null && pwd) || echo "$main_worktree"
}

# Canonical repo key for an app's recorded worktree path, used to backfill
# state entries written before repositories were tracked.
repo_key_for_worktree() {
    local worktree="$1"
    local main_worktree

    if [[ -d "$worktree" ]]; then
        main_worktree=$(git -C "$worktree" worktree list --porcelain 2>/dev/null \
            | head -1 | sed 's/^worktree //')
        if [[ -n "$main_worktree" ]]; then
            (cd -P "$main_worktree" 2>/dev/null && pwd) || echo "$main_worktree"
            return 0
        fi
    fi

    # Worktree is gone. rive names worktree directories
    # <RIVE_WORKTREE_DIR>/<repo-name>/<branch>, so the parent directory is the
    # repo name - the best identity still recoverable.
    basename "$(dirname "$worktree")"
}

# Human-readable name for a repo key
repo_display_name() {
    basename "$1"
}

# Decide whether this invocation sees one repository or all of them.
#
# Precedence, highest first:
#   1. --global / -G / --all / -a  on the command line
#   2. RIVE_DEFAULT_SCOPE          from .env or the environment
#   3. local
#
# Outside a git repository "local" has nothing to mean, so it becomes global.
resolve_scope() {
    local scope="${RIVE_SCOPE_FLAG:-}"

    if [[ -z "$scope" ]]; then
        scope="${RIVE_DEFAULT_SCOPE:-local}"
    fi

    if [[ "$scope" == "local" ]] && ! get_repo_key >/dev/null 2>&1; then
        log_debug "Not inside a git repository, using global scope"
        scope="global"
    fi

    echo "$scope"
}

# Splits "repo:branch" into its parts. Git forbids colons in ref names
# (`git check-ref-format` rejects them), so the first colon is an unambiguous
# separator and no real branch name can be misread as qualified.
#
# Prints "repo" for field=repo and "branch" for field=branch. For an
# unqualified identifier the repo part is empty.
parse_identifier() {
    local identifier="$1"
    local field="${2:-branch}"

    case "$field" in
        repo)
            if [[ "$identifier" == *:* ]]; then
                echo "${identifier%%:*}"
            fi
            ;;
        branch)
            if [[ "$identifier" == *:* ]]; then
                echo "${identifier#*:}"
            else
                echo "$identifier"
            fi
            ;;
    esac
}

# Every state line whose repo matches, given how the caller named it.
#
# A qualified identifier names a repository by its display name; if several
# repositories share that name, all their apps are returned and the caller
# reports the ambiguity.
lines_for_repo_name() {
    local repo_name="$1"
    local line line_repo

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        line_repo=$(parse_state_line "$line" "repo")
        if [[ "$(repo_display_name "$line_repo")" == "$repo_name" ]]; then
            echo "$line"
        fi
    done < <(state_list_apps)
}

# Resolves an identifier to exactly one state line, or explains why it cannot.
#
# Accepts, in order of precedence:
#   - a port          (globally unique, so it always resolves without a scope)
#   - repo:branch     (explicit, works from anywhere)
#   - branch          (this repository under local scope; all under global)
#
# Prints the matching state line on success. On failure prints a diagnostic to
# stderr and returns 1; on ambiguity it lists the candidates as repo:branch
# pairs so the user can copy one straight back into the command.
resolve_app() {
    local identifier="$1"
    local scope="${2:-local}"

    # Ports are unique across every repository
    if [[ "$identifier" =~ ^[0-9]+$ ]]; then
        local by_port
        by_port=$(state_get_app_by_port "$identifier")
        if [[ -n "$by_port" ]]; then
            echo "$by_port"
            return 0
        fi
        log_error "No review app on port $identifier"
        return 1
    fi

    local want_repo want_branch
    want_repo=$(parse_identifier "$identifier" "repo")
    want_branch=$(parse_identifier "$identifier" "branch")

    local candidates=()
    local line line_repo line_branch
    local current_repo=""

    if [[ -z "$want_repo" && "$scope" == "local" ]]; then
        current_repo=$(get_repo_key 2>/dev/null) || true
    fi

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        line_branch=$(parse_state_line "$line" "branch")
        [[ "$line_branch" == "$want_branch" ]] || continue
        line_repo=$(parse_state_line "$line" "repo")

        if [[ -n "$want_repo" ]]; then
            # Qualified: match on the repository's display name
            [[ "$(repo_display_name "$line_repo")" == "$want_repo" ]] || continue
        elif [[ -n "$current_repo" ]]; then
            # Unqualified under local scope: this repository only
            [[ "$line_repo" == "$current_repo" ]] || continue
        fi

        candidates+=("$line")
    done < <(state_list_apps)

    case ${#candidates[@]} in
        1)
            echo "${candidates[0]}"
            return 0
            ;;
        0)
            if [[ -n "$want_repo" ]]; then
                log_error "Review app not found: $want_repo:$want_branch"
            elif [[ "$scope" == "local" ]]; then
                log_error "Review app not found in this repository: $want_branch"
                # Point at it if it is running somewhere else
                local elsewhere
                elsewhere=$(resolve_app "$want_branch" "global" 2>/dev/null) || true
                if [[ -n "$elsewhere" ]]; then
                    local other_repo
                    other_repo=$(parse_state_line "$elsewhere" "repo")
                    log_info "It is running in $(repo_display_name "$other_repo") - try:"
                    log_info "  rive <command> $(repo_display_name "$other_repo"):$want_branch"
                fi
            else
                log_error "Review app not found: $want_branch"
            fi
            return 1
            ;;
        *)
            log_error "'$want_branch' matches review apps in ${#candidates[@]} repositories:"
            local candidate cand_repo cand_port
            for candidate in "${candidates[@]}"; do
                cand_repo=$(parse_state_line "$candidate" "repo")
                cand_port=$(parse_state_line "$candidate" "port")
                log_info "  $(repo_display_name "$cand_repo"):$want_branch (port $cand_port)"
            done
            log_info "Name one of them, or use its port."
            return 1
            ;;
    esac
}
