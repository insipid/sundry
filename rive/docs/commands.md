# Command Reference

## add

Create a new review app from a git branch.

**Aliases:** `start`, `create`, `new`, `up`

```bash
rive add [branch]

# Examples
rive add                         # Interactive branch selection
rive add feature/user-auth
rive start bugfix/login-error
rive create feature/new-ui
```

**What happens:**
1. Prompts for a branch if none was given (see [Interactive Branch Selection](#interactive-branch-selection))
2. Validates branch exists (fetches if needed)
3. Finds an available port
4. Creates a git worktree in a repository-namespaced directory
5. Optionally installs dependencies (if `RIVE_AUTO_INSTALL=true`)
6. Starts the development server
7. Saves state for management
8. Sets as the current app

**Branch name validation:** Branch names containing shell metacharacters
(`;`, `` ` ``, `|`, `..`, and similar) are rejected before reaching git.

**Special case:** If you select the branch already checked out in your main
working directory, rive skips worktree creation and starts the server in the
repository root instead.

## Interactive Branch Selection

Running `rive add` without a branch name opens a picker. The list combines all
local branches with any remote branches that have no local counterpart:

```
  1) main (current)
  2) feature/checkout-flow [worktree: ~/.rive/worktrees/myrepo/checkout-flow]
  3) origin/feature/user-profile (remote)
```

**Annotations:**

| Marker | Meaning |
|--------|---------|
| `(current)` | Branch checked out in the main working directory |
| `(remote)` | Exists only on a remote; the local branch is created on selection |
| `[worktree: path]` | Branch already has a worktree at `path` |

**Selection interface:**
- If [fzf](https://github.com/junegunn/fzf) is on your `PATH`, you get a
  fuzzy-filterable list (type to narrow, arrow keys to move, Enter to select)
- Otherwise rive falls back to a numbered menu — enter the number and press Enter

Any remote name is supported, not just `origin`. Selecting nothing (Esc in fzf,
or an out-of-range number) cancels without creating an app.

The picker writes its prompts to stderr, so `cd $(rive cd)` and similar command
substitutions still work correctly.

## list

List all running review apps.

**Aliases:** `ls`, `l`

```bash
rive list
```

**Output:**
```
BRANCH                      PORT    STATUS     UPTIME      WORKTREE
────────────────────────────────────────────────────────────────────
feature/user-auth          40000   running    2h 15m      ~/.rive/worktrees/myrepo/user-auth
bugfix/login-error         40001   running    45m         ~/.rive/worktrees/myrepo/login-error
```

## status

Show detailed information about a single review app. Where `list` gives you a
table across every app, `status` gives depth on one.

```bash
rive status [branch|port]

# Examples
rive status feature/user-auth
rive status 40000
rive status                      # Status of current app (if set)
```

**Output:**
```
Review app: feature/user-auth

  Repository:   my-api
  Status:       running
  PID:          51234
  Uptime:       2h 15m
  Port:         40000
  URL:          http://localhost:40000
  Worktree:     ~/.rive/worktrees/my-api/feature-user-auth
  Changes:      clean
  Logs:         ~/.rive/worktrees/my-api/feature-user-auth/.rive-server.log
  Current app:  yes
```

**Repository** is the repo the app belongs to. It is the only place rive shows
this — see [Multiple repositories](configuration.md#multiple-repositories).

**Changes** reflects the worktree's git state: `clean`, `uncommitted changes`,
or `worktree missing` if the directory has been deleted behind rive's back.
`.rive-server.log` is ignored, the same as it is when deciding whether removal
is safe.

If the server process is not running, `status` reports `stopped`, suggests
`restart` or `clean`, and exits non-zero — so it is usable in scripts.

## remove

Stop a running review app.

**Aliases:** `stop`, `delete`, `del`, `down`, `rm`

```bash
rive remove [branch|port|all]

# Examples
rive remove feature/user-auth    # Remove by branch name
rive remove 40000                # Remove by port number
rive remove                      # Remove current app (if set)
rive remove my-web:main          # Remove an app in another repository
rive remove all                  # Remove every app in this repository
rive remove all --global         # Remove every app, everywhere
```

**`all`** stops every running review app in scope. It applies exactly the same
per-app rules as a single removal — clean worktrees are removed, dirty ones are
preserved with a warning, and the current-app pointer is cleared. There is no
confirmation prompt; naming `all` is the confirmation.

`all` is a keyword, not a flag: `--all` is now one of the spellings of global
scope. So `rive remove all` clears this repository and `rive remove all --all`
(or `-a`) clears every repository.

If one app fails to stop, the rest are still processed and the command reports
how many succeeded before exiting non-zero. With no apps running it prints
`No running review apps` and exits 0.

**Auto-Cleanup Behavior:**
- If the worktree is **clean** (no uncommitted/untracked changes): Automatically removed
- If the worktree is **dirty** (has changes): Preserved with a warning message
- **Note:** The `.rive-server.log` file is automatically excluded from the dirty check

## restart

Restart an existing review app (keeps same port and worktree).

```bash
rive restart [branch]

# Examples
rive restart feature/user-auth
rive restart                   # Restart current app (if set)
```

## cd

Print the path to a review app's worktree (for use with shell `cd`).

```bash
cd $(rive cd [branch|port])

# Examples
cd $(rive cd feature/user-auth)
cd $(rive cd 40000)
cd $(rive cd)                  # Navigate to current app (if set)
```

**Pro tip:** Create an alias for easier use:
```bash
# Add to ~/.bashrc or ~/.zshrc
alias rivecd='cd $(rive cd)'

# Or with argument support
rivecd() {
    cd "$(rive cd "$@")"
}

# Usage
rivecd                    # Navigate to current app
rivecd feature/user-auth  # Navigate to specific app
```

## pull

Pull latest changes from the remote branch into the worktree.

```bash
rive pull [branch|port]

# Examples
rive pull feature/user-auth
rive pull 40000
rive pull                      # Pull for current app (if set)
```

**How it works:**
- Queries the upstream tracking branch from the main repository
- Explicitly pulls from that remote/branch combination in the worktree
- No reliance on upstream configuration in the worktree itself

## logs

Tail the server log file for a review app.

```bash
rive logs [branch|port]

# Examples
rive logs feature/user-auth
rive logs 40000
rive logs                      # Show logs for current app (if set)
```

**Note:** Logs are only available when `RIVE_ENABLE_LOGS=true` or when the app was created with `--verbose`.

Press Ctrl+C to exit the log viewer.

## use

Set or show the current app context.

```bash
rive use [branch|port]         # Set current app
rive use                       # Show current app
rive use --clear               # Clear current app

# Examples
rive use feature/new-ui        # Set current app
rive use                       # Show what's current
```

**Interactive selection:** If no current app is set and apps are running,
`rive use` offers to show the branch picker so you can choose one.

**Current app context:**
Once set, commands like `cd`, `pull`, `logs`, `stop`, and `restart` can be used without arguments - they'll operate on the current app.

The current app is automatically set when you create a new review app, and automatically cleared when you stop it.

## config

Show current configuration in a format that can be sourced or used as `.env`.

```bash
rive config

# Save to file
rive config > .env
```

## demo-server

Run a throwaway server. Useful for trying rive out before you have a real server
command, or for checking that an app really did start and answer on its port.

```bash
rive demo-server <port>
```

Normally you do not run it directly — you set it as your server command:

```bash
RIVE_SERVER_COMMAND="rive demo-server %PORT%"
```

Then `rive add <branch>` gives you a working review app immediately:

```bash
rive add feature/blue
curl http://localhost:40000/index.html   # serves feature/blue's files
```

**What it runs:**

- **python3** if available — `python3 -m http.server`, serving the current
  directory. Since rive starts servers inside the worktree, you get that
  branch's files, which is the quickest way to confirm worktree isolation is
  doing what you expect.
- **nc** otherwise — answers a fixed plain-text response naming the port and
  directory. Enough to prove the port is live. It rebinds after each request,
  so a rapid burst can occasionally hit the gap between listeners; fine for a
  check, not something to lean on.

If neither is available it exits with an error rather than pretending to start.

**This is not a real server.** It has no build step, no hot reload, and serves
static files at best. Point `RIVE_SERVER_COMMAND` at your own dev server for
real work.

## clean

Clean up stale state entries (processes that are no longer running).

```bash
rive clean
```

## help

Show help message with command overview.

```bash
rive help
```

## version

Show version information.

```bash
rive version
rive --version
rive -V
```

**Note the case:** `-V` is version, `-v` is verbose — the convention used by
`curl`, `ssh`, `rsync`, and `python`. They are different flags:

```bash
rive -V          # prints the version
rive -v add foo  # creates an app with verbose output
```
