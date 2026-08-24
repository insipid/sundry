#!/usr/bin/env bats
# BATS integration tests for rive CLI
# Run with: bats test/rive.bats

# Test directory setup
setup_file() {
    export RIVE_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
    export LIB_DIR="$RIVE_DIR/lib"
}

setup() {
    # Create temp directory for each test
    TEST_TEMP="$(mktemp -d)"

    # Override rive config for testing
    export RIVE_WORKTREE_DIR="$TEST_TEMP/worktrees"
    export RIVE_STATE_FILE="$TEST_TEMP/state"
    export RIVE_CURRENT_FILE="$TEST_TEMP/current"
    export RIVE_START_PORT=50000
    export RIVE_SERVER_COMMAND="echo test --port %PORT%"
    export RIVE_VERBOSE=false
    export RIVE_AUTO_INSTALL=false

    # Source libraries
    source "$LIB_DIR/utils.sh"
    source "$LIB_DIR/config.sh"
    source "$LIB_DIR/state.sh"
    source "$LIB_DIR/port.sh"
    source "$LIB_DIR/worktree.sh"
    source "$LIB_DIR/process.sh"

    # Create test directories
    mkdir -p "$RIVE_WORKTREE_DIR"
    mkdir -p "$(dirname "$RIVE_STATE_FILE")"
}

teardown() {
    # Clean up temp directory after each test
    if [[ -n "$TEST_TEMP" && -d "$TEST_TEMP" ]]; then
        rm -rf "$TEST_TEMP"
    fi
}

#############################################
# Configuration Tests
#############################################

@test "config: defaults are set" {
    [[ -n "$RIVE_START_PORT" ]]
    [[ -n "$RIVE_WORKTREE_DIR" ]]
}

@test "config: valid port passes validation" {
    RIVE_START_PORT=8080
    run validate_config
    [ "$status" -eq 0 ]
}

@test "config: port below 1024 fails validation" {
    RIVE_START_PORT=100
    run validate_config
    [ "$status" -ne 0 ]
}

@test "config: non-numeric port fails validation" {
    RIVE_START_PORT="abc"
    run validate_config
    [ "$status" -ne 0 ]
}

@test "config: missing %PORT% placeholder fails validation" {
    RIVE_SERVER_COMMAND="npm start"
    run validate_config
    [ "$status" -ne 0 ]
}

@test "config: relative worktree path fails validation" {
    RIVE_WORKTREE_DIR="relative/path"
    run validate_config
    [ "$status" -ne 0 ]
}

@test "config: writable existing directory passes check" {
    local test_dir="$TEST_TEMP/writable_test"
    mkdir -p "$test_dir"
    run check_path_writable "$test_dir" "Test dir"
    [ "$status" -eq 0 ]
}

@test "config: non-existent but creatable path passes check" {
    local test_dir="$TEST_TEMP/new_subdir/deep/path"
    run check_path_writable "$test_dir" "Test dir"
    [ "$status" -eq 0 ]
}

#############################################
# State Management Tests
#############################################

@test "state: file initialization creates state file" {
    init_state_file
    [ -f "$RIVE_STATE_FILE" ]
}

@test "state: add app writes to state file" {
    init_state_file
    state_add_app "test-branch" "50001" "$TEST_TEMP/worktree1" "12345"
    grep -q "test-branch|50001" "$RIVE_STATE_FILE"
}

@test "state: get app by branch returns correct entry" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "feature/test" "50002" "$TEST_TEMP/worktree2" "12346"
    run state_get_app "feature/test"
    [[ "$output" == *"feature/test"* ]]
}

@test "state: get app by port returns correct entry" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "feature/port-test" "50003" "$TEST_TEMP/worktree3" "12347"
    run state_get_app_by_port "50003"
    [[ "$output" == *"feature/port-test"* ]]
}

@test "state: remove app deletes entry from state" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "to-remove" "50004" "$TEST_TEMP/worktree4" "12348"
    state_remove_app "to-remove"
    run grep "to-remove" "$RIVE_STATE_FILE"
    [ "$status" -ne 0 ]
}

@test "state: has_app returns true for existing branch" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "existing-branch" "50005" "$TEST_TEMP/worktree5" "12349"
    run state_has_app "existing-branch"
    [ "$status" -eq 0 ]
}

@test "state: has_app returns false for missing branch" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    run state_has_app "nonexistent-branch"
    [ "$status" -ne 0 ]
}

@test "state: parse_state_line extracts all fields correctly" {
    local line="my-branch|40001|/path/to/worktree|99999|1700000000"

    run parse_state_line "$line" "branch"
    [ "$output" = "my-branch" ]

    run parse_state_line "$line" "port"
    [ "$output" = "40001" ]

    run parse_state_line "$line" "worktree"
    [ "$output" = "/path/to/worktree" ]

    run parse_state_line "$line" "pid"
    [ "$output" = "99999" ]

    run parse_state_line "$line" "timestamp"
    [ "$output" = "1700000000" ]
}

@test "state: set and get current app" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "current-test" "50006" "$TEST_TEMP/worktree6" "12350"
    set_current_app "current-test"
    run get_current_app
    [ "$output" = "current-test" ]
}

@test "state: clear current app removes file" {
    echo "some-branch" > "$RIVE_CURRENT_FILE"
    clear_current_app
    [ ! -f "$RIVE_CURRENT_FILE" ]
}

@test "state: mark_stopped replaces the pid with the stopped sentinel" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "stop-me" "50010" "$TEST_TEMP/worktree10" "12345"

    state_mark_stopped "stop-me"

    local app
    app=$(state_get_app "stop-me")
    run parse_state_line "$app" "pid"
    [ "$output" = "-" ]
}

@test "state: mark_stopped preserves port and worktree" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "stop-me" "50011" "$TEST_TEMP/worktree11" "12345"

    state_mark_stopped "stop-me"

    local app
    app=$(state_get_app "stop-me")
    run parse_state_line "$app" "port"
    [ "$output" = "50011" ]

    app=$(state_get_app "stop-me")
    run parse_state_line "$app" "worktree"
    [ "$output" = "$TEST_TEMP/worktree11" ]
}

# `rive list` calls state_clean_stale before printing, so a stopped app that
# got reaped here would vanish the moment the user listed their apps.
@test "state: clean_stale keeps a deliberately stopped app" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "stopped-app" "50012" "$TEST_TEMP/worktree12" "12345"
    state_mark_stopped "stopped-app"

    state_clean_stale

    run state_has_app "stopped-app"
    [ "$status" -eq 0 ]
}

@test "state: clean_stale still removes an app whose process died" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "crashed-app" "50013" "$TEST_TEMP/worktree13" 999999

    state_clean_stale

    run state_has_app "crashed-app"
    [ "$status" -ne 0 ]
}

#############################################
# Config File Precedence Tests
#############################################

# Precedence, lowest to highest: environment variables, .env, .rive.env, CLI
# flags. `.rive.env` exists so rive settings can be kept apart from - and can
# override - whatever else a project already puts in its general-purpose .env.

@test "config: .env in the current directory is loaded" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_START_PORT=45000" > .env

    load_config_files

    [ "$RIVE_START_PORT" = "45000" ]
}

@test "config: .rive.env in the current directory is loaded" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_START_PORT=46000" > .rive.env

    load_config_files

    [ "$RIVE_START_PORT" = "46000" ]
}

@test "config: .rive.env takes precedence over .env" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_START_PORT=45000" > .env
    echo "RIVE_START_PORT=46000" > .rive.env

    load_config_files

    [ "$RIVE_START_PORT" = "46000" ]
}

# .rive.env overrides key by key, it does not replace the whole file
@test "config: .env still supplies keys .rive.env does not set" {
    cd "$TEST_TEMP" || return 1
    printf 'RIVE_START_PORT=45000\nRIVE_HOSTNAME=from-dot-env\n' > .env
    echo "RIVE_START_PORT=46000" > .rive.env

    load_config_files

    [ "$RIVE_START_PORT" = "46000" ]
    [ "$RIVE_HOSTNAME" = "from-dot-env" ]
}

@test "config: absent config files are not an error" {
    cd "$TEST_TEMP" || return 1

    run load_config_files
    [ "$status" -eq 0 ]
}

@test "config: non-RIVE keys in .rive.env are ignored" {
    cd "$TEST_TEMP" || return 1
    printf 'SOME_OTHER_VAR=nope\nRIVE_START_PORT=46000\n' > .rive.env

    load_config_files

    [ "$RIVE_START_PORT" = "46000" ]
    [ -z "${SOME_OTHER_VAR:-}" ]
}

@test "cli: a flag outranks .rive.env" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_START_PORT=46000" > .rive.env

    run "$RIVE_DIR/bin/rive" --start-port 51234 config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_START_PORT=51234"* ]]
}

@test "cli: a flag outranks .env" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_START_PORT=45000" > .env

    run "$RIVE_DIR/bin/rive" --start-port 51234 config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_START_PORT=51234"* ]]
}

@test "cli: --hostname outranks .rive.env" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_HOSTNAME=from-file" > .rive.env

    run "$RIVE_DIR/bin/rive" --hostname from-flag config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_HOSTNAME=from-flag"* ]]
}

@test "cli: .rive.env is used when no flag overrides it" {
    cd "$TEST_TEMP" || return 1
    echo "RIVE_HOSTNAME=from-rive-env" > .rive.env

    run "$RIVE_DIR/bin/rive" config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_HOSTNAME=from-rive-env"* ]]
}

#############################################
# Port Management Tests
#############################################

@test "port: unused port is detected as not in use" {
    # Port 59999 is very unlikely to be in use
    run is_port_in_use 59999
    [ "$status" -ne 0 ]
}

@test "port: allocation returns valid port number" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    run find_available_port
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^[0-9]+$ ]]
    [ "$output" -ge "$RIVE_START_PORT" ]
}

@test "port: allocation skips a port held by a running app" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    # $$ is this test process, so the entry counts as a live allocation
    state_add_app "feature/taken" "$RIVE_START_PORT" "$TEST_TEMP/wt" "$$"
    run find_available_port
    [ "$status" -eq 0 ]
    [ "$output" -gt "$RIVE_START_PORT" ]
}

@test "port: allocation reuses a port whose process is gone" {
    if is_port_in_use "$RIVE_START_PORT"; then
        skip "port $RIVE_START_PORT is in use on this machine"
    fi
    init_state_file
    : > "$RIVE_STATE_FILE"
    # A stale entry left by a crashed server must not reserve the port forever
    state_add_app "feature/stale" "$RIVE_START_PORT" "$TEST_TEMP/wt" 999999
    run find_available_port
    [ "$status" -eq 0 ]
    [ "$output" -eq "$RIVE_START_PORT" ]
}

# A stopped app is resumed on its original port, so that port must stay
# reserved - otherwise the next `rive add` takes it and the resume collides.
@test "port: a stopped app keeps its port reserved" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "feature/stopped" "$RIVE_START_PORT" "$TEST_TEMP/wt" "12345"
    state_mark_stopped "feature/stopped"

    run is_port_allocated "$RIVE_START_PORT"
    [ "$status" -eq 0 ]
}

@test "port: allocation skips a port held by a stopped app" {
    init_state_file
    : > "$RIVE_STATE_FILE"
    state_add_app "feature/stopped" "$RIVE_START_PORT" "$TEST_TEMP/wt" "12345"
    state_mark_stopped "feature/stopped"

    run find_available_port
    [ "$status" -eq 0 ]
    [ "$output" -gt "$RIVE_START_PORT" ]
}

#############################################
# Utility Function Tests
#############################################

@test "utils: valid branch name passes validation" {
    run validate_branch_name "feature/my-branch"
    [ "$status" -eq 0 ]
}

@test "utils: branch with numbers passes validation" {
    run validate_branch_name "feature/JIRA-123-add-login"
    [ "$status" -eq 0 ]
}

@test "utils: branch with .. fails validation" {
    # Run in subshell since validate_branch_name calls error_exit
    run bash -c 'source "$LIB_DIR/utils.sh"; validate_branch_name "feature/../escape"'
    [ "$status" -ne 0 ]
}

@test "utils: branch with semicolon fails validation" {
    run bash -c 'source "$LIB_DIR/utils.sh"; validate_branch_name "feature;rm -rf /"'
    [ "$status" -ne 0 ]
}

@test "utils: branch with backtick fails validation" {
    run bash -c 'source "$LIB_DIR/utils.sh"; validate_branch_name "feature/\`whoami\`"'
    [ "$status" -ne 0 ]
}

@test "utils: branch with pipe fails validation" {
    run bash -c 'source "$LIB_DIR/utils.sh"; validate_branch_name "feature|cat /etc/passwd"'
    [ "$status" -ne 0 ]
}

@test "utils: sanitize branch name replaces slashes" {
    run sanitize_branch_name "feature/my-branch"
    [ "$output" = "feature-my-branch" ]
}

@test "utils: sanitize branch name handles multiple slashes" {
    run sanitize_branch_name "refs/heads/feature/test"
    [ "$output" = "refs-heads-feature-test" ]
}

#############################################
# Process Management Tests
#############################################

@test "process: status for non-running process returns stopped" {
    run get_process_status "999999"
    [ "$output" = "stopped" ]
}

@test "process: status for empty PID returns unknown" {
    run get_process_status ""
    [ "$output" = "unknown" ]
}

@test "process: calculate uptime shows hours" {
    local now
    now=$(date +%s)
    local one_hour_ago=$((now - 3600))
    run calculate_uptime "$one_hour_ago"
    [[ "$output" == *"h"* ]]
}

@test "process: calculate uptime shows days" {
    local now
    now=$(date +%s)
    local two_days_ago=$((now - 172800))
    run calculate_uptime "$two_days_ago"
    [[ "$output" == *"d"* ]]
}

@test "process: status for the stopped sentinel returns stopped" {
    run get_process_status "-"
    [ "$output" = "stopped" ]
}

#############################################
# Process Tree Tests
#############################################

# A server command is launched through `bash -c`, so the PID rive records is a
# wrapper, not the process bound to the port. These tests use a fake server
# that spawns a child - the shape of `npm run dev` spawning vite - to prove the
# whole tree is signalled, not just the wrapper.
fake_server_with_child() {
    cat > "$TEST_TEMP/fakeserver.sh" <<'EOS'
#!/usr/bin/env bash
sleep 300 &
echo $! > "$FAKE_CHILD_FILE"
wait
EOS
    chmod +x "$TEST_TEMP/fakeserver.sh"
    export FAKE_CHILD_FILE="$TEST_TEMP/child.pid"
    export RIVE_SERVER_COMMAND="$TEST_TEMP/fakeserver.sh --port %PORT%"
}

@test "process: server is started as its own process group leader" {
    fake_server_with_child
    mkdir -p "$TEST_TEMP/wt"

    local pid pgid
    pid=$(start_server 50020 "$TEST_TEMP/wt")

    pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')
    [ "$pgid" = "$pid" ]

    kill -KILL -"$pid" 2>/dev/null || true
}

@test "process: stopping a server also kills its children" {
    fake_server_with_child
    mkdir -p "$TEST_TEMP/wt"

    local pid child
    pid=$(start_server 50021 "$TEST_TEMP/wt")
    child=$(cat "$FAKE_CHILD_FILE")
    ps -p "$child" >/dev/null 2>&1

    stop_server "$pid" 50021

    run ps -p "$child"
    [ "$status" -ne 0 ]
}

@test "process: stopping an already-dead app is not an error" {
    run stop_server 999999 50022
    [ "$status" -eq 0 ]
}

@test "process: stopping the stopped sentinel is not an error" {
    run stop_server "-" 50023
    [ "$status" -eq 0 ]
}

#############################################
# CLI Integration Tests
#############################################

@test "cli: help command shows usage" {
    run "$RIVE_DIR/bin/rive" help
    [ "$status" -eq 0 ]
    [[ "$output" == *"Rive - Ephemeral review app manager"* ]]
}

@test "cli: version command shows version" {
    run "$RIVE_DIR/bin/rive" version
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

@test "cli: --version prints the version" {
    run "$RIVE_DIR/bin/rive" --version
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

@test "cli: -V prints the version" {
    run "$RIVE_DIR/bin/rive" -V
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

# -V must survive the global flag parser running ahead of the dispatcher
@test "cli: -V works alongside other flags" {
    run "$RIVE_DIR/bin/rive" --verbose -V
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

# -v is the short form of --verbose. It must not also mean --version, or the
# global flag parser and the command dispatcher disagree about what it does.
@test "cli: -v means verbose, not version" {
    run "$RIVE_DIR/bin/rive" -v
    [ "$status" -eq 0 ]
    [[ "$output" == *"USAGE:"* ]]
    ! [[ "$output" =~ rive\ version\ [0-9] ]]
}

@test "cli: --hostname flag overrides the configured hostname" {
    run "$RIVE_DIR/bin/rive" --hostname 0.0.0.0 config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_HOSTNAME=0.0.0.0"* ]]
}

@test "cli: config command shows configuration" {
    run "$RIVE_DIR/bin/rive" config
    [ "$status" -eq 0 ]
    [[ "$output" == *"RIVE_START_PORT"* ]]
}

@test "cli: list with empty state shows no apps" {
    : > "$RIVE_STATE_FILE"
    run "$RIVE_DIR/bin/rive" list
    [ "$status" -eq 0 ]
    [[ "$output" == *"No running review apps"* ]]
}

# The documented install puts a symlink on PATH pointing back into the repo,
# so the script must locate lib/ relative to the resolved target rather than
# relative to the symlink itself.
@test "cli: runs via an absolute symlink" {
    ln -s "$RIVE_DIR/bin/rive" "$TEST_TEMP/rive-link"
    run "$TEST_TEMP/rive-link" version
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

@test "cli: runs via a chain of symlinks" {
    ln -s "$RIVE_DIR/bin/rive" "$TEST_TEMP/rive-hop1"
    ln -s "$TEST_TEMP/rive-hop1" "$TEST_TEMP/rive-hop2"
    run "$TEST_TEMP/rive-hop2" version
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}

@test "cli: runs via a symlink with a relative target" {
    # The second link's target is a bare filename, so it only resolves if the
    # relative target is joined to the symlink's own directory rather than cwd
    ln -s "$RIVE_DIR/bin/rive" "$TEST_TEMP/rive-abs"
    ln -s "rive-abs" "$TEST_TEMP/rive-rel"
    cd /
    run "$TEST_TEMP/rive-rel" version
    [ "$status" -eq 0 ]
    [[ "$output" == *"rive version"* ]]
}
