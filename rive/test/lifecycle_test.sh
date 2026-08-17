#!/usr/bin/env bash
# End-to-end lifecycle tests for rive CLI
#
# These drive the real CLI against a throwaway git repository: worktrees are
# genuinely created, server processes are genuinely spawned and killed, and
# assertions are made against the resulting filesystem, process table, and
# state file. This is the counterpart to test/rive.bats, which unit-tests the
# library functions in isolation.
#
# Run from anywhere, directly or through a symlink:
#   ./test/lifecycle_test.sh
#
# Requires nothing beyond bash and git. Tests that need extra tooling skip
# themselves rather than failing.

set -uo pipefail

# Resolves ${BASH_SOURCE[0]} through any symlinks (including chains) and prints
# the directory the REAL file lives in. See the same helper in bin/rive.
resolve_script_dir() {
    local source dir
    source="${BASH_SOURCE[0]}"
    while [ -h "$source" ]; do
        dir="$(cd -P "$(dirname "$source")" && pwd)"
        source="$(readlink "$source")"
        [[ "$source" == /* ]] || source="$dir/$source"
    done
    cd -P "$(dirname "$source")" && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
RIVE_DIR="$(dirname "$SCRIPT_DIR")"
LIB_DIR="$RIVE_DIR/lib"
RIVE="$RIVE_DIR/bin/rive"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_ROOT=""
REPO=""
REPO2=""
# Tags the fake server processes so strays can be swept up in cleanup
SERVER_MARKER="rive-lifecycle-test-$$"

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------

print_header() {
    echo ""
    echo -e "${YELLOW}=== $1 ===${NC}"
}

pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "  ${GREEN}PASS${NC}: $1"
}

fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "  ${RED}FAIL${NC}: $1"
    if [[ -n "${2:-}" ]]; then
        echo -e "        ${RED}$2${NC}"
    fi
}

skip() {
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
    echo -e "  ${BLUE}SKIP${NC}: $1 ($2)"
}

run_test() {
    local test_name="$1"
    local test_func="$2"
    TESTS_RUN=$((TESTS_RUN + 1))

    local result=0
    $test_func || result=$?

    case $result in
        0)  pass "$test_name" ;;
        99) TESTS_RUN=$((TESTS_RUN - 1)) ;;  # test called skip() itself
        *)  fail "$test_name" ;;
    esac
}

assert_eq() {
    if [[ "$1" == "$2" ]]; then
        return 0
    fi
    echo "        Expected: '$1'" >&2
    echo "        Got:      '$2'" >&2
    return 1
}

assert_contains() {
    if [[ "$1" == *"$2"* ]]; then
        return 0
    fi
    echo "        Output does not contain '$2'" >&2
    return 1
}

assert_dir_exists() {
    if [[ -d "$1" ]]; then
        return 0
    fi
    echo "        Directory does not exist: $1" >&2
    return 1
}

assert_dir_missing() {
    if [[ ! -d "$1" ]]; then
        return 0
    fi
    echo "        Directory still exists: $1" >&2
    return 1
}

assert_pid_alive() {
    if ps -p "$1" >/dev/null 2>&1; then
        return 0
    fi
    echo "        Process $1 is not running" >&2
    return 1
}

assert_pid_dead() {
    if ! ps -p "$1" >/dev/null 2>&1; then
        return 0
    fi
    echo "        Process $1 is still running" >&2
    return 1
}

# ---------------------------------------------------------------------------
# Fixture setup / teardown
# ---------------------------------------------------------------------------

# Kills anything this suite spawned, tears down worktrees, removes the temp
# tree. Runs on every exit path including failures and Ctrl-C.
cleanup() {
    local state_entry pid
    if [[ -n "${RIVE_STATE_FILE:-}" && -f "$RIVE_STATE_FILE" ]]; then
        while IFS= read -r state_entry; do
            [[ -z "$state_entry" ]] && continue
            pid="$(cut -d'|' -f4 <<< "$state_entry")"
            [[ -n "$pid" ]] && kill -KILL "$pid" 2>/dev/null
        done < "$RIVE_STATE_FILE"
    fi

    # Anything still holding the marker, e.g. a test that died mid-add
    [[ -n "${SERVER_MARKER:-}" ]] && pkill -f "$SERVER_MARKER" 2>/dev/null

    if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then
        rm -rf "$TEST_ROOT"
    fi
}
trap cleanup EXIT INT TERM

setup_fixture() {
    TEST_ROOT="$(mktemp -d)"

    # Guard: every path rive writes to must live under the temp tree, so a bug
    # in this suite can never touch the caller's real ~/.rive or repositories.
    export RIVE_WORKTREE_DIR="$TEST_ROOT/worktrees"
    export RIVE_STATE_FILE="$TEST_ROOT/state"
    # RIVE_CURRENT_FILE is NOT derived from RIVE_STATE_FILE - it defaults to
    # $HOME/.rive/current independently, so overriding only the state file
    # would leave the current-app pointer writing into the caller's real
    # ~/.rive. It must be overridden explicitly.
    export RIVE_CURRENT_FILE="$TEST_ROOT/current"
    export RIVE_START_PORT=41500
    export RIVE_HOSTNAME=localhost
    export RIVE_AUTO_INSTALL=false
    export RIVE_ENABLE_LOGS=false
    export RIVE_VERBOSE=false
    export RIVE_SERVER_COMMAND="sleep 600 # $SERVER_MARKER %PORT%"

    # Every path rive writes to must be inside the temp tree. Checking only the
    # state file was not enough: the current-app pointer has its own default.
    local guarded
    for guarded in "$RIVE_STATE_FILE" "$RIVE_CURRENT_FILE" "$RIVE_WORKTREE_DIR"; do
        case "$guarded" in
            "$TEST_ROOT"/*) ;;
            *) echo "REFUSING TO RUN: $guarded is outside the temp tree" >&2; exit 1 ;;
        esac
    done

    # A bare repo to act as "origin", so remote-branch behaviour is real
    git init -q --bare "$TEST_ROOT/origin.git"

    REPO="$TEST_ROOT/sample-project"
    git init -q "$REPO"
    cd "$REPO" || exit 1
    git config user.email "test@example.com"
    git config user.name "Rive Test"
    git config commit.gpgsign false
    git symbolic-ref HEAD refs/heads/main

    echo "# sample" > README.md
    git add README.md
    git commit -qm "Initial commit"

    git branch feature/alpha
    git branch feature/beta

    git remote add origin "$TEST_ROOT/origin.git"
    git push -q origin main feature/alpha feature/beta

    # A branch that exists only on the remote, to exercise remote-only handling
    git branch feature/remote-only
    git push -q origin feature/remote-only
    git branch -qD feature/remote-only
    git fetch -q origin

    # A second repository sharing a branch name with the first, so repository
    # scoping and the collision it used to cause can be tested for real
    REPO2="$TEST_ROOT/other-project"
    git init -q "$REPO2"
    (
        cd "$REPO2" || exit 1
        git config user.email "test@example.com"
        git config user.name "Rive Test"
        git config commit.gpgsign false
        git symbolic-ref HEAD refs/heads/main
        echo "# other" > README.md
        git add README.md
        git commit -qm "Initial commit"
        git branch feature/alpha
    )
    cd "$REPO" || exit 1

    # Reuse the real implementations for path/state assertions rather than
    # reimplementing them (and drifting from) the code under test
    # shellcheck source=/dev/null
    source "$LIB_DIR/utils.sh"
    # shellcheck source=/dev/null
    source "$LIB_DIR/config.sh"
    # shellcheck source=/dev/null
    source "$LIB_DIR/state.sh"
}

# Path rive will pick for a branch, derived from the real implementation
expected_worktree() {
    echo "$RIVE_WORKTREE_DIR/$(basename "$REPO")/$(sanitize_branch_name "$1")"
}

state_field() {
    local branch="$1" field="$2" line
    line="$(grep "^${branch}|" "$RIVE_STATE_FILE" 2>/dev/null | head -1)"
    [[ -z "$line" ]] && return 1
    case "$field" in
        branch)   cut -d'|' -f1 <<< "$line" ;;
        port)     cut -d'|' -f2 <<< "$line" ;;
        worktree) cut -d'|' -f3 <<< "$line" ;;
        pid)      cut -d'|' -f4 <<< "$line" ;;
    esac
}

# Removes every app so each test starts from a known state
reset_apps() {
    local branch line wt
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        branch="$(cut -d'|' -f1 <<< "$line")"
        "$RIVE" remove "$branch" >/dev/null 2>&1
    done < <(cat "$RIVE_STATE_FILE" 2>/dev/null)

    # `remove` deliberately preserves dirty worktrees, so tests that leave
    # uncommitted files behind would otherwise leak them into later tests.
    # Clear anything still registered under the suite's worktree directory.
    #
    # git reports PHYSICAL paths, while RIVE_WORKTREE_DIR is whatever mktemp
    # handed us - on macOS that is /var/... which is a symlink to /private/var.
    # Comparing the two directly never matches, which left dirty worktrees
    # registered, their directories deleted by the rm below, and the next
    # `add` resolving to a path that no longer existed.
    local wt_root
    wt_root="$(cd -P "$RIVE_WORKTREE_DIR" 2>/dev/null && pwd)" || wt_root="$RIVE_WORKTREE_DIR"
    while IFS= read -r wt; do
        case "$wt" in
            "$wt_root"/*|"$RIVE_WORKTREE_DIR"/*) ;;
            *) continue ;;
        esac
        git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1
    done < <(git -C "$REPO" worktree list --porcelain 2>/dev/null \
        | awk '/^worktree /{print substr($0, 10)}')

    # Prune AFTER deleting the directories, so registrations whose directories
    # are gone are cleaned up rather than left dangling
    rm -rf "${RIVE_WORKTREE_DIR:?}"/*
    git -C "$REPO" worktree prune >/dev/null 2>&1

    : > "$RIVE_STATE_FILE"
    rm -f "$RIVE_CURRENT_FILE"
}

# ---------------------------------------------------------------------------
# Create / worktree lifecycle
# ---------------------------------------------------------------------------

test_add_creates_worktree() {
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    assert_dir_exists "$(expected_worktree feature/alpha)"
}

test_add_worktree_is_checkout_of_branch() {
    local wt
    wt="$(expected_worktree feature/alpha)"
    local branch
    branch="$(cd "$wt" && git branch --show-current)"
    assert_eq "feature/alpha" "$branch"
}

test_add_starts_live_process() {
    local pid
    pid="$(state_field feature/alpha pid)" || return 1
    assert_pid_alive "$pid"
}

test_add_records_state() {
    local port wt
    port="$(state_field feature/alpha port)" || return 1
    wt="$(state_field feature/alpha worktree)" || return 1
    assert_eq "41500" "$port" || return 1
    assert_eq "$(expected_worktree feature/alpha)" "$wt"
}

test_add_sets_current_app() {
    local out
    out="$("$RIVE" use 2>&1)"
    assert_contains "$out" "feature/alpha"
}

test_list_shows_running_app() {
    local out
    out="$("$RIVE" list 2>&1)"
    assert_contains "$out" "feature/alpha" || return 1
    assert_contains "$out" "41500"
}

test_add_second_app_gets_next_port() {
    "$RIVE" add feature/beta >/dev/null 2>&1 || return 1
    local port
    port="$(state_field feature/beta port)" || return 1
    [[ "$port" != "41500" ]] || { echo "        Second app reused port 41500" >&2; return 1; }
    assert_eq "41501" "$port"
}

test_add_duplicate_branch_is_rejected() {
    local out result=0
    out="$("$RIVE" add feature/alpha 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit for duplicate" >&2; return 1; }
    assert_contains "$out" "already running"
}

test_cd_prints_worktree_path() {
    local out
    out="$("$RIVE" cd feature/alpha 2>/dev/null)"
    assert_eq "$(expected_worktree feature/alpha)" "$out"
}

test_use_switches_current_app() {
    "$RIVE" use feature/beta >/dev/null 2>&1 || return 1
    local out
    out="$("$RIVE" use 2>&1)"
    assert_contains "$out" "feature/beta"
}

test_restart_keeps_port_changes_pid() {
    local old_pid old_port new_pid new_port
    old_pid="$(state_field feature/alpha pid)"
    old_port="$(state_field feature/alpha port)"

    "$RIVE" restart feature/alpha >/dev/null 2>&1 || return 1

    new_pid="$(state_field feature/alpha pid)"
    new_port="$(state_field feature/alpha port)"

    assert_eq "$old_port" "$new_port" || return 1
    [[ "$old_pid" != "$new_pid" ]] || { echo "        PID unchanged after restart" >&2; return 1; }
    assert_pid_alive "$new_pid" || return 1
    assert_pid_dead "$old_pid"
}

# ---------------------------------------------------------------------------
# Removal and cleanup
# ---------------------------------------------------------------------------

test_remove_stops_process() {
    local pid
    pid="$(state_field feature/beta pid)" || return 1
    "$RIVE" remove feature/beta >/dev/null 2>&1 || return 1
    assert_pid_dead "$pid"
}

test_remove_deletes_clean_worktree() {
    assert_dir_missing "$(expected_worktree feature/beta)"
}

test_remove_clears_state_entry() {
    if grep -q "^feature/beta|" "$RIVE_STATE_FILE" 2>/dev/null; then
        echo "        State entry still present" >&2
        return 1
    fi
    return 0
}

test_remove_clears_current_app_when_current() {
    # feature/beta was current when removed above
    local out
    out="$("$RIVE" use 2>&1)"
    if [[ "$out" == *"feature/beta"* ]]; then
        echo "        Current app still points at removed branch" >&2
        return 1
    fi
    return 0
}

test_remove_preserves_dirty_worktree() {
    "$RIVE" add feature/beta >/dev/null 2>&1 || return 1
    local wt
    wt="$(expected_worktree feature/beta)"
    echo "work in progress" > "$wt/uncommitted.txt"

    "$RIVE" remove feature/beta >/dev/null 2>&1 || return 1
    assert_dir_exists "$wt" || return 1
    [[ -f "$wt/uncommitted.txt" ]] || { echo "        Uncommitted work was lost" >&2; return 1; }
    return 0
}

test_server_log_alone_does_not_block_removal() {
    # Clear the dirty worktree left by the previous test
    git worktree remove --force "$(expected_worktree feature/beta)" >/dev/null 2>&1
    git worktree prune >/dev/null 2>&1

    RIVE_ENABLE_LOGS=true "$RIVE" add feature/beta >/dev/null 2>&1 || return 1
    local wt
    wt="$(expected_worktree feature/beta)"
    [[ -f "$wt/.rive-server.log" ]] || { echo "        Expected .rive-server.log to be created" >&2; return 1; }

    "$RIVE" remove feature/beta >/dev/null 2>&1 || return 1
    assert_dir_missing "$wt"
}

test_clean_removes_stale_entry() {
    "$RIVE" add feature/beta >/dev/null 2>&1 || return 1
    local pid
    pid="$(state_field feature/beta pid)" || return 1

    # Simulate a crashed server: kill the process behind rive's back
    kill -KILL "$pid" 2>/dev/null
    sleep 1

    "$RIVE" clean >/dev/null 2>&1 || return 1

    if grep -q "^feature/beta|" "$RIVE_STATE_FILE" 2>/dev/null; then
        echo "        Stale entry survived clean" >&2
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Lookup by port
#
# Regression: state_get_app returned non-zero when the branch lookup missed.
# Under `set -e` that killed the command before the port lookup ran, so every
# documented "by port" form silently did nothing.
# ---------------------------------------------------------------------------

test_cd_by_port() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    local port out
    port="$(state_field feature/alpha port)" || return 1
    out="$("$RIVE" cd "$port" 2>/dev/null)"
    assert_eq "$(expected_worktree feature/alpha)" "$out"
}

test_remove_by_port() {
    local port
    port="$(state_field feature/alpha port)" || return 1
    "$RIVE" remove "$port" >/dev/null 2>&1 || return 1

    if grep -q "^feature/alpha|" "$RIVE_STATE_FILE" 2>/dev/null; then
        echo "        App survived remove by port" >&2
        return 1
    fi
    return 0
}

test_lookup_of_unknown_app_reports_clearly() {
    local out result=0
    out="$("$RIVE" status no-such-branch 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit" >&2; return 1; }
    assert_contains "$out" "not found"
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

test_status_reports_running_app() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1

    local out
    out="$("$RIVE" status feature/alpha 2>&1)" || return 1
    assert_contains "$out" "feature/alpha" || return 1
    assert_contains "$out" "running" || return 1
    assert_contains "$out" "$(state_field feature/alpha port)" || return 1
    assert_contains "$out" "clean"
}

test_status_names_the_repository() {
    local out
    out="$("$RIVE" status feature/alpha 2>&1)" || return 1
    assert_contains "$out" "$(basename "$REPO")"
}

test_status_defaults_to_current_app() {
    local out
    out="$("$RIVE" status 2>&1)" || return 1
    assert_contains "$out" "feature/alpha"
}

test_status_by_port() {
    local port out
    port="$(state_field feature/alpha port)" || return 1
    out="$("$RIVE" status "$port" 2>&1)" || return 1
    assert_contains "$out" "feature/alpha"
}

test_status_reports_uncommitted_changes() {
    echo "wip" > "$(expected_worktree feature/alpha)/wip.txt"
    local out
    out="$("$RIVE" status feature/alpha 2>&1)" || return 1
    assert_contains "$out" "uncommitted changes"
}

test_status_flags_a_dead_process() {
    local pid out result=0
    pid="$(state_field feature/alpha pid)" || return 1
    kill -KILL "$pid" 2>/dev/null
    sleep 1

    out="$("$RIVE" status feature/alpha 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit for dead process" >&2; return 1; }
    assert_contains "$out" "stopped" || return 1
    assert_contains "$out" "not running"
}

# ---------------------------------------------------------------------------
# remove all
# ---------------------------------------------------------------------------

test_remove_all_stops_every_app() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    "$RIVE" add feature/beta >/dev/null 2>&1 || return 1

    local pid_a pid_b
    pid_a="$(state_field feature/alpha pid)" || return 1
    pid_b="$(state_field feature/beta pid)" || return 1

    "$RIVE" remove all >/dev/null 2>&1 || return 1

    assert_pid_dead "$pid_a" || return 1
    assert_pid_dead "$pid_b" || return 1

    if [[ -s "$RIVE_STATE_FILE" ]]; then
        echo "        State file still has entries" >&2
        return 1
    fi
    return 0
}

test_remove_all_removes_clean_worktrees() {
    assert_dir_missing "$(expected_worktree feature/alpha)" || return 1
    assert_dir_missing "$(expected_worktree feature/beta)"
}

# `remove all` must apply the same per-app rules, not bulldoze everything
test_remove_all_preserves_dirty_worktrees() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    "$RIVE" add feature/beta >/dev/null 2>&1 || return 1

    local dirty
    dirty="$(expected_worktree feature/beta)"
    echo "work in progress" > "$dirty/uncommitted.txt"

    "$RIVE" remove all >/dev/null 2>&1 || return 1

    assert_dir_missing "$(expected_worktree feature/alpha)" || return 1
    assert_dir_exists "$dirty" || return 1
    [[ -f "$dirty/uncommitted.txt" ]] || { echo "        Uncommitted work was lost" >&2; return 1; }
    return 0
}

test_remove_all_with_no_apps_is_not_an_error() {
    # Clear the dirty worktree the previous test deliberately left behind
    git worktree remove --force "$(expected_worktree feature/beta)" >/dev/null 2>&1
    git worktree prune >/dev/null 2>&1
    reset_apps

    local out result=0
    out="$("$RIVE" remove all 2>&1)" || result=$?
    [[ $result -eq 0 ]] || { echo "        Expected exit 0, got $result" >&2; return 1; }
    assert_contains "$out" "No running review apps"
}

test_remove_all_clears_current_app() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    "$RIVE" remove all >/dev/null 2>&1 || return 1

    local out
    out="$("$RIVE" use 2>&1)"
    if [[ "$out" == *"feature/alpha"* ]]; then
        echo "        Current app survived remove all" >&2
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# demo-server
# ---------------------------------------------------------------------------

# Needs a real HTTP client to be meaningful
have_curl() { command -v curl >/dev/null 2>&1; }

test_demo_server_requires_a_port() {
    local out result=0
    out="$("$RIVE" demo-server 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit" >&2; return 1; }
    assert_contains "$out" "No port specified"
}

test_demo_server_rejects_a_non_numeric_port() {
    local out result=0
    out="$("$RIVE" demo-server not-a-port 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit" >&2; return 1; }
    assert_contains "$out" "Invalid port"
}

# The point of the demo server: an app started with it actually answers on its
# allocated port, serving that branch's worktree rather than the main checkout.
test_demo_server_answers_on_the_allocated_port() {
    if ! have_curl; then
        skip "demo server answers on its port" "curl not available"
        return 99
    fi

    reset_apps

    # Give the branch a file that main does not have, so the response proves
    # which worktree is being served
    (
        cd "$REPO" || exit 1
        git checkout -q feature/alpha
        printf 'served-from-alpha\n' > marker.txt
        git add marker.txt
        git commit -qm "alpha marker"
        git checkout -q main
    ) || return 1

    local saved_command="$RIVE_SERVER_COMMAND"
    RIVE_SERVER_COMMAND="$RIVE demo-server %PORT%"
    export RIVE_SERVER_COMMAND

    "$RIVE" add feature/alpha >/dev/null 2>&1 || {
        RIVE_SERVER_COMMAND="$saved_command"; export RIVE_SERVER_COMMAND
        return 1
    }

    local port body result=0
    port="$(state_field feature/alpha port)"

    # The server needs a moment to bind
    local waited=0
    while (( waited < 10 )); do
        body="$(curl -s --max-time 2 "http://localhost:$port/marker.txt" 2>/dev/null)" || true
        [[ -n "$body" ]] && break
        sleep 1
        waited=$((waited + 1))
    done

    [[ "$body" == *"served-from-alpha"* ]] || {
        echo "        Expected the branch's file, got: '$body'" >&2
        result=1
    }

    "$RIVE" remove feature/alpha >/dev/null 2>&1
    RIVE_SERVER_COMMAND="$saved_command"
    export RIVE_SERVER_COMMAND
    return $result
}

# ---------------------------------------------------------------------------
# Repository scoping
#
# The bug that motivated all of this: state was keyed by branch name alone, so
# the same branch could not run in two repositories at once.
# ---------------------------------------------------------------------------

# Runs rive from the second repository
rive_in_repo2() {
    (cd "$REPO2" && "$RIVE" "$@")
}

test_same_branch_runs_in_two_repos() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    rive_in_repo2 add feature/alpha >/dev/null 2>&1 || {
        echo "        Second repository was refused the same branch name" >&2
        return 1
    }

    local count
    count=$(grep -c "^feature/alpha|" "$RIVE_STATE_FILE")
    assert_eq "2" "$count"
}

test_the_two_apps_get_different_ports() {
    local ports
    ports=$(grep "^feature/alpha|" "$RIVE_STATE_FILE" | cut -d'|' -f2 | sort -u | grep -c .)
    assert_eq "2" "$ports"
}

test_state_records_distinct_repositories() {
    local repos
    repos=$(grep "^feature/alpha|" "$RIVE_STATE_FILE" | cut -d'|' -f6 | sort -u | grep -c .)
    assert_eq "2" "$repos"
}

test_list_is_local_by_default() {
    local out
    out="$("$RIVE" list 2>&1)"
    # One row for this repo, plus the hint that more exist elsewhere
    assert_eq "1" "$(grep -c "^feature/alpha " <<< "$out")" || return 1
    assert_contains "$out" "other repositories"
}

test_list_global_shows_both_with_repo_column() {
    local out
    out="$("$RIVE" list --global 2>&1)"
    assert_contains "$out" "REPO" || return 1
    assert_eq "2" "$(grep -c "feature/alpha" <<< "$out")" || return 1
    assert_contains "$out" "$(basename "$REPO2")"
}

test_scope_flag_aliases_are_equivalent() {
    local a b
    a="$("$RIVE" list --global 2>&1 | grep -c feature/alpha)"
    b="$("$RIVE" list -a 2>&1 | grep -c feature/alpha)"
    assert_eq "$a" "$b" || return 1
    b="$("$RIVE" list -G 2>&1 | grep -c feature/alpha)"
    assert_eq "$a" "$b"
}

test_bare_name_resolves_to_local_repo() {
    local out
    out="$("$RIVE" status feature/alpha 2>&1)" || return 1
    assert_contains "$out" "$(basename "$REPO")"
}

test_qualified_name_reaches_other_repo() {
    local out
    out="$("$RIVE" status "$(basename "$REPO2"):feature/alpha" 2>&1)" || return 1
    assert_contains "$out" "$(basename "$REPO2")"
}

test_ambiguous_name_lists_candidates() {
    local out result=0
    out="$("$RIVE" status feature/alpha --global 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit on ambiguity" >&2; return 1; }
    assert_contains "$out" "2 repositories" || return 1
    assert_contains "$out" "$(basename "$REPO"):feature/alpha" || return 1
    assert_contains "$out" "$(basename "$REPO2"):feature/alpha"
}

test_default_scope_env_var_widens_scope() {
    local out
    out="$(RIVE_DEFAULT_SCOPE=global "$RIVE" list 2>&1)"
    assert_eq "2" "$(grep -c "feature/alpha" <<< "$out")"
}

test_invalid_default_scope_is_rejected() {
    local out result=0
    out="$(RIVE_DEFAULT_SCOPE=nonsense "$RIVE" list 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit" >&2; return 1; }
    assert_contains "$out" "must be 'local' or 'global'"
}

test_current_app_is_per_repository() {
    # Both repos have an app; each should report its own as current
    local here there
    here="$("$RIVE" use 2>&1)"
    there="$(cd "$REPO2" && "$RIVE" use 2>&1)"
    assert_contains "$here" "feature/alpha" || return 1
    assert_contains "$there" "feature/alpha" || return 1

    # Clearing one must not clear the other
    "$RIVE" use --clear >/dev/null 2>&1
    there="$(cd "$REPO2" && "$RIVE" use 2>&1)"
    assert_contains "$there" "feature/alpha"
}

test_remove_all_is_scoped_to_this_repo() {
    "$RIVE" remove all >/dev/null 2>&1 || return 1
    # This repo is cleared; the other repo's app survives
    local count
    count=$(grep -c "^feature/alpha|" "$RIVE_STATE_FILE" || true)
    assert_eq "1" "$count"
}

test_remove_all_global_clears_everything() {
    "$RIVE" remove all --global >/dev/null 2>&1 || return 1
    if grep -q . "$RIVE_STATE_FILE" 2>/dev/null; then
        echo "        State file still has entries" >&2
        return 1
    fi
    return 0
}

test_legacy_state_entries_are_backfilled() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1

    # Rewrite as a pre-scoping entry: five fields, no repository
    cut -d'|' -f1-5 "$RIVE_STATE_FILE" > "$RIVE_STATE_FILE.legacy"
    mv "$RIVE_STATE_FILE.legacy" "$RIVE_STATE_FILE"
    [[ "$(cut -d'|' -f6 "$RIVE_STATE_FILE")" == "" ]] || return 1

    # Any command triggers the backfill; no user action required
    "$RIVE" list >/dev/null 2>&1

    local repo
    repo=$(cut -d'|' -f6 "$RIVE_STATE_FILE")
    [[ -n "$repo" ]] || { echo "        Repository was not backfilled" >&2; return 1; }
    assert_eq "$(basename "$REPO")" "$(basename "$repo")"
}

# ---------------------------------------------------------------------------
# Interactive branch selection
# ---------------------------------------------------------------------------

# Drops every PATH entry containing an fzf executable, so the numbered-menu
# fallback is exercised identically on machines with and without fzf.
strip_fzf_from_path() {
    local newpath="" d
    local -a dirs
    IFS=: read -ra dirs <<< "$PATH"
    for d in "${dirs[@]}"; do
        [[ -n "$d" && -x "$d/fzf" ]] && continue
        newpath="${newpath:+$newpath:}$d"
    done
    printf '%s' "$newpath"
}

# Invokes rive through this suite's own interpreter rather than the shebang.
# On macOS, fzf and a modern bash often share a directory (/opt/homebrew/bin),
# so stripping fzf from PATH would otherwise drop rive onto the system bash 3.2
# and fail on bash 4 syntax - testing the wrong thing entirely.
rive_without_fzf() {
    env PATH="$(strip_fzf_from_path)" "$BASH" "$RIVE" "$@"
}

# rive's branch picker uses associative arrays, which need bash 4+
have_bash4() {
    [[ "${BASH_VERSINFO[0]}" -ge 4 ]]
}

test_menu_lists_local_branches() {
    have_bash4 || { skip "menu lists local branches" "rive branch picker needs bash 4+"; return 99; }
    local out
    out="$(printf '999\n' | rive_without_fzf add 2>&1)" || true
    assert_contains "$out" "feature/alpha" || return 1
    assert_contains "$out" "feature/beta" || return 1
    assert_contains "$out" "main"
}

test_menu_marks_current_branch() {
    have_bash4 || { skip "menu marks the current branch" "rive branch picker needs bash 4+"; return 99; }
    local out
    out="$(printf '999\n' | rive_without_fzf add 2>&1)" || true
    assert_contains "$out" "(current)"
}

test_menu_marks_remote_only_branches() {
    have_bash4 || { skip "menu marks remote-only branches" "rive branch picker needs bash 4+"; return 99; }
    local out
    out="$(printf '999\n' | rive_without_fzf add 2>&1)" || true
    assert_contains "$out" "(remote)"
}

test_menu_rejects_invalid_selection() {
    have_bash4 || { skip "menu rejects an invalid selection" "rive branch picker needs bash 4+"; return 99; }
    local out result=0
    out="$(printf '999\n' | rive_without_fzf add 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit" >&2; return 1; }
    assert_contains "$out" "Invalid selection"
}

test_menu_selection_creates_app() {
    have_bash4 || { skip "selecting from the menu creates an app" "rive branch picker needs bash 4+"; return 99; }
    reset_apps
    # Local branches sort first: 1) feature/alpha  2) feature/beta  3) main
    printf '1\n' | rive_without_fzf add >/dev/null 2>&1 || return 1
    assert_dir_exists "$(expected_worktree feature/alpha)" || return 1
    state_field feature/alpha pid >/dev/null
}

test_menu_can_select_remote_only_branch() {
    have_bash4 || { skip "a remote-only branch can be selected" "rive branch picker needs bash 4+"; return 99; }
    reset_apps
    # After the three local branches comes origin/feature/remote-only
    local out result=0
    out="$(printf '4\n' | rive_without_fzf add 2>&1)" || result=$?
    if [[ $result -ne 0 ]]; then
        echo "        add failed: $out" >&2
        return 1
    fi
    # Worktree naming derives from the selected ref; assert an app now exists
    # rather than pinning the exact local branch name git's DWIM chooses
    local count
    count="$(grep -c . "$RIVE_STATE_FILE" 2>/dev/null || echo 0)"
    [[ "$count" -ge 1 ]] || { echo "        No app recorded after remote selection" >&2; return 1; }
    return 0
}

# Locates a bash 3.x binary if the machine has one (macOS ships /bin/bash 3.2)
find_bash3() {
    local candidate
    for candidate in /bin/bash /usr/bin/bash; do
        if [[ -x "$candidate" ]]; then
            case "$("$candidate" -c 'echo ${BASH_VERSINFO[0]}' 2>/dev/null)" in
                3) echo "$candidate"; return 0 ;;
            esac
        fi
    done
    return 1
}

# The picker needs bash 4+ for its associative array. On bash 3.2 that used to
# fail with a bare "local: -A: invalid option"; it must now explain itself.
test_picker_explains_itself_on_bash3() {
    local bash3
    if ! bash3="$(find_bash3)"; then
        skip "picker reports a clear error on bash 3.x" "no bash 3.x on this machine"
        return 99
    fi

    local out result=0
    out="$(printf '1\n' | "$bash3" "$RIVE" add 2>&1)" || result=$?
    [[ $result -ne 0 ]] || { echo "        Expected non-zero exit on bash 3.x" >&2; return 1; }
    assert_contains "$out" "requires bash 4.0 or newer" || return 1
    # The old cryptic failure must not resurface
    if [[ "$out" == *"invalid option"* ]]; then
        echo "        Still failing with the raw bash error" >&2
        return 1
    fi
    return 0
}

# Everything except the picker works on bash 3.2, so the guard must not
# turn into a blanket refusal to run
test_explicit_branch_still_works_on_bash3() {
    local bash3
    if ! bash3="$(find_bash3)"; then
        skip "explicit branch works on bash 3.x" "no bash 3.x on this machine"
        return 99
    fi

    reset_apps
    "$bash3" "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    assert_dir_exists "$(expected_worktree feature/alpha)" || return 1
    state_field feature/alpha pid >/dev/null
}

# ---------------------------------------------------------------------------
# Current-branch and port-collision behaviour
# ---------------------------------------------------------------------------

test_add_current_branch_runs_in_repo_root() {
    reset_apps
    local out
    out="$("$RIVE" add main 2>&1)" || return 1
    assert_contains "$out" "current branch" || return 1

    # rive reports git's physical path; on macOS $TMPDIR is itself a symlink
    # (/var -> /private/var), so compare both sides resolved
    local wt expected
    wt="$(state_field main worktree)" || return 1
    wt="$(cd -P "$wt" && pwd)"
    expected="$(cd -P "$REPO" && pwd)"
    assert_eq "$expected" "$wt" || return 1
    assert_dir_missing "$RIVE_WORKTREE_DIR/$(basename "$REPO")/main"
}

# Regression: `rive add <current-branch>` records the repository root as the
# app's "worktree". Removing that app must not delete the repository. Before
# this was guarded, `rive remove` fell through to `rm -rf <repo root>` and
# destroyed the working tree and .git along with it.
test_remove_never_deletes_the_repository() {
    reset_apps
    local canary="$REPO/do-not-delete.txt"
    echo "irreplaceable" > "$canary"
    (cd "$REPO" && git add do-not-delete.txt && git commit -qm "canary")

    "$RIVE" add main >/dev/null 2>&1 || return 1
    "$RIVE" remove main >/dev/null 2>&1 || return 1

    assert_dir_exists "$REPO" || return 1
    assert_dir_exists "$REPO/.git" || return 1
    [[ -f "$canary" ]] || { echo "        Committed file was destroyed" >&2; return 1; }

    # The repository must still be a working git repo, not a husk
    (cd "$REPO" && git log -1 --format=%s >/dev/null 2>&1) || {
        echo "        Repository is no longer a valid git repo" >&2
        return 1
    }
    return 0
}

# The guard above must not stop rive removing the linked worktrees it owns
test_remove_still_deletes_linked_worktrees() {
    reset_apps
    "$RIVE" add feature/alpha >/dev/null 2>&1 || return 1
    local wt
    wt="$(expected_worktree feature/alpha)"
    assert_dir_exists "$wt" || return 1

    "$RIVE" remove feature/alpha >/dev/null 2>&1 || return 1
    assert_dir_missing "$wt"
}

test_allocation_skips_port_held_by_other_process() {
    reset_apps
    if ! command -v python3 >/dev/null 2>&1; then
        skip "allocation skips port held by another process" "python3 not available"
        return 99
    fi

    # Occupy the first port rive would hand out, from outside rive entirely
    local squatter_log="$TEST_ROOT/squatter.log"
    python3 -m http.server "$RIVE_START_PORT" --bind 127.0.0.1 > "$squatter_log" 2>&1 &
    local squatter=$!
    sleep 2

    if ! ps -p "$squatter" >/dev/null 2>&1; then
        skip "allocation skips port held by another process" \
             "could not bind test port: $(tr '\n' ' ' < "$squatter_log" 2>/dev/null)"
        return 99
    fi

    "$RIVE" add feature/alpha >/dev/null 2>&1
    local port
    port="$(state_field feature/alpha port)"
    kill -KILL "$squatter" 2>/dev/null

    [[ "$port" != "$RIVE_START_PORT" ]] || {
        echo "        Allocated a port already bound by another process" >&2
        return 1
    }
    return 0
}

# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

main() {
    echo "========================================"
    echo "  RIVE Lifecycle Tests"
    echo "========================================"
    echo "  Driving the real CLI against a throwaway repository."
    echo "  This spawns and kills real processes; allow ~1 minute."

    setup_fixture

    print_header "Create and Worktree Lifecycle"
    run_test "add creates a worktree" test_add_creates_worktree
    run_test "worktree is a checkout of the branch" test_add_worktree_is_checkout_of_branch
    run_test "add starts a live server process" test_add_starts_live_process
    run_test "add records branch, port and worktree in state" test_add_records_state
    run_test "add sets the current app" test_add_sets_current_app
    run_test "list shows the running app" test_list_shows_running_app
    run_test "second app gets the next free port" test_add_second_app_gets_next_port
    run_test "adding a duplicate branch is rejected" test_add_duplicate_branch_is_rejected
    run_test "cd prints the worktree path" test_cd_prints_worktree_path
    run_test "use switches the current app" test_use_switches_current_app
    run_test "restart keeps the port and replaces the process" test_restart_keeps_port_changes_pid

    print_header "Removal and Cleanup"
    run_test "remove stops the server process" test_remove_stops_process
    run_test "remove deletes a clean worktree" test_remove_deletes_clean_worktree
    run_test "remove clears the state entry" test_remove_clears_state_entry
    run_test "remove clears the current app" test_remove_clears_current_app_when_current
    run_test "remove preserves a dirty worktree" test_remove_preserves_dirty_worktree
    run_test "server log alone does not block removal" test_server_log_alone_does_not_block_removal
    run_test "clean removes entries for dead processes" test_clean_removes_stale_entry

    print_header "Lookup by Port"
    run_test "cd resolves an app by port" test_cd_by_port
    run_test "remove resolves an app by port" test_remove_by_port
    run_test "an unknown app is reported clearly" test_lookup_of_unknown_app_reports_clearly

    print_header "Status"
    run_test "status reports a running app" test_status_reports_running_app
    run_test "status names the repository" test_status_names_the_repository
    run_test "status defaults to the current app" test_status_defaults_to_current_app
    run_test "status resolves an app by port" test_status_by_port
    run_test "status reports uncommitted changes" test_status_reports_uncommitted_changes
    run_test "status flags a dead process" test_status_flags_a_dead_process

    print_header "Remove All"
    run_test "remove all stops every app" test_remove_all_stops_every_app
    run_test "remove all removes clean worktrees" test_remove_all_removes_clean_worktrees
    run_test "remove all preserves dirty worktrees" test_remove_all_preserves_dirty_worktrees
    run_test "remove all with no apps is not an error" test_remove_all_with_no_apps_is_not_an_error
    run_test "remove all clears the current app" test_remove_all_clears_current_app

    print_header "Demo Server"
    run_test "demo-server requires a port" test_demo_server_requires_a_port
    run_test "demo-server rejects a non-numeric port" test_demo_server_rejects_a_non_numeric_port
    run_test "demo-server answers on the allocated port" test_demo_server_answers_on_the_allocated_port

    print_header "Repository Scoping"
    run_test "same branch runs in two repositories" test_same_branch_runs_in_two_repos
    run_test "the two apps get different ports" test_the_two_apps_get_different_ports
    run_test "state records distinct repositories" test_state_records_distinct_repositories
    run_test "list is local by default" test_list_is_local_by_default
    run_test "list --global shows both with a REPO column" test_list_global_shows_both_with_repo_column
    run_test "--global, -G, -a and --all are equivalent" test_scope_flag_aliases_are_equivalent
    run_test "a bare name resolves to the local repository" test_bare_name_resolves_to_local_repo
    run_test "a qualified name reaches another repository" test_qualified_name_reaches_other_repo
    run_test "an ambiguous name lists the candidates" test_ambiguous_name_lists_candidates
    run_test "RIVE_DEFAULT_SCOPE widens the default" test_default_scope_env_var_widens_scope
    run_test "an invalid RIVE_DEFAULT_SCOPE is rejected" test_invalid_default_scope_is_rejected
    run_test "the current app is per repository" test_current_app_is_per_repository
    run_test "remove all is scoped to this repository" test_remove_all_is_scoped_to_this_repo
    run_test "remove all --global clears everything" test_remove_all_global_clears_everything
    run_test "legacy state entries are backfilled" test_legacy_state_entries_are_backfilled

    print_header "Interactive Branch Selection"
    run_test "menu lists local branches" test_menu_lists_local_branches
    run_test "menu marks the current branch" test_menu_marks_current_branch
    run_test "menu marks remote-only branches" test_menu_marks_remote_only_branches
    run_test "menu rejects an invalid selection" test_menu_rejects_invalid_selection
    run_test "selecting from the menu creates an app" test_menu_selection_creates_app
    run_test "a remote-only branch can be selected" test_menu_can_select_remote_only_branch
    run_test "picker reports a clear error on bash 3.x" test_picker_explains_itself_on_bash3
    run_test "explicit branch still works on bash 3.x" test_explicit_branch_still_works_on_bash3

    print_header "Current Branch and Port Collisions"
    run_test "add on the current branch uses the repo root" test_add_current_branch_runs_in_repo_root
    run_test "remove never deletes the repository itself" test_remove_never_deletes_the_repository
    run_test "remove still deletes linked worktrees" test_remove_still_deletes_linked_worktrees
    run_test "allocation skips a port held by another process" test_allocation_skips_port_held_by_other_process

    echo ""
    echo "========================================"
    echo "  Test Summary"
    echo "========================================"
    echo "  Total:   $TESTS_RUN"
    echo -e "  ${GREEN}Passed:  $TESTS_PASSED${NC}"
    if [[ $TESTS_SKIPPED -gt 0 ]]; then
        echo -e "  ${BLUE}Skipped: $TESTS_SKIPPED${NC}"
    fi
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "  ${RED}Failed:  $TESTS_FAILED${NC}"
        echo ""
        echo "Some tests failed."
        exit 1
    fi
    echo ""
    echo "All tests passed!"
    exit 0
}

main "$@"
