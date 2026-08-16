# Configuration

Rive loads configuration from multiple sources with the following precedence:

1. **CLI flags** (highest priority)
2. **`.env` file** in current directory
3. **Environment variables** (lowest priority)

## Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RIVE_START_PORT` | `40000` | Starting port for allocation |
| `RIVE_HOSTNAME` | `localhost` | Hostname for server binding |
| `RIVE_WORKTREE_DIR` | `~/.rive/worktrees` | Base directory for worktrees |
| `RIVE_SERVER_COMMAND` | `npm run dev -- --port %PORT%` | Server command (`%PORT%` and `%HOSTNAME%` are replaced) |
| `RIVE_STATE_FILE` | `~/.rive/state` | State file location |
| `RIVE_CURRENT_FILE` | `~/.rive/current` | Current-app pointer location |
| `RIVE_AUTO_INSTALL` | `false` | Auto-install dependencies |
| `RIVE_INSTALL_COMMAND` | _(auto-detected)_ | Custom install command |
| `RIVE_ENABLE_LOGS` | `false` | Log server output to `.rive-server.log` in worktree (auto-cleaned on stop) |
| `RIVE_VERBOSE` | `false` | Enable verbose output |

## Creating a .env File

Create a `.env` file in your project directory:

```bash
# .env
RIVE_START_PORT=40000
RIVE_HOSTNAME=localhost
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT% --host %HOSTNAME%"
RIVE_AUTO_INSTALL=true
RIVE_ENABLE_LOGS=true
```

## Exporting Configuration

You can export the current configuration to a file:

```bash
# Save configuration to a file
rive config > my-config.env

# Source it in your shell
source my-config.env

# Or use it as .env
cp my-config.env .env
```

## Framework-Specific Commands

### Node.js (npm/yarn/pnpm)
```bash
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT% --host %HOSTNAME%"
RIVE_SERVER_COMMAND="yarn dev --port %PORT%"
RIVE_SERVER_COMMAND="pnpm dev --port %PORT%"
```

### Python (Django/Flask)
```bash
RIVE_SERVER_COMMAND="python manage.py runserver %HOSTNAME%:%PORT%"
RIVE_SERVER_COMMAND="FLASK_RUN_PORT=%PORT% FLASK_RUN_HOST=%HOSTNAME% flask run"
```

### Ruby on Rails
```bash
RIVE_SERVER_COMMAND="rails server -p %PORT% -b %HOSTNAME%"
```

### Go
```bash
RIVE_SERVER_COMMAND="PORT=%PORT% HOST=%HOSTNAME% go run main.go"
```

## Command-Line Flags

Override configuration on a per-command basis:

Flags go **before** the command:

```bash
# Use a different starting port
rive --start-port 50000 add feature/branch

# Bind the server to a different hostname
rive --hostname 0.0.0.0 add feature/branch

# Use a different worktree directory
rive --worktree-dir /tmp/rive add feature/branch

# Enable verbose mode
rive --verbose add feature/branch
# or
rive -v add feature/branch
```

Available flags:

| Flag | Sets |
|------|------|
| `--verbose`, `-v` | `RIVE_VERBOSE=true` |
| `--start-port PORT` | `RIVE_START_PORT` |
| `--hostname HOST` | `RIVE_HOSTNAME` |
| `--worktree-dir DIR` | `RIVE_WORKTREE_DIR` |

**Mind the case:** `-v` is verbose, `-V` is version — as in `curl`, `ssh`, and
`python`.

### A note on `RIVE_CURRENT_FILE`

`RIVE_CURRENT_FILE` is **not** derived from `RIVE_STATE_FILE`. Each has its own
independent default, so pointing rive at a different state file does not move
the current-app pointer with it:

```bash
# The state file moves, but the current app is still tracked in ~/.rive/current
RIVE_STATE_FILE=/tmp/my-state rive list
```

If you are relocating rive's state — for a test harness, a sandbox, or a
per-project setup — set both:

```bash
export RIVE_STATE_FILE=/tmp/rive/state
export RIVE_CURRENT_FILE=/tmp/rive/current
```

## Multiple repositories

rive works across as many repositories as you like, but it is worth knowing
exactly what is shared and what is not.

**Namespaced per repository:**

- **Worktrees.** Each repo gets its own directory under `RIVE_WORKTREE_DIR`,
  named after the repository:
  ```
  ~/.rive/worktrees/my-api/feature-login
  ~/.rive/worktrees/my-web/feature-login
  ```
  The name is the repository's directory name, so two checkouts that happen to
  share a directory name (`~/work/api` and `~/oss/api`) share a namespace.

**Shared globally, across every repository:**

- **The state file** (`~/.rive/state`) — one flat list of every running app
- **The current-app pointer** (`~/.rive/current`) — one current app in total,
  not one per repository
- **Port allocation** — ports are handed out from a single pool, which is what
  stops apps in different repos colliding on a port
- **Every command** — `list` shows apps from all repositories, and `cd`, `pull`,
  `logs`, `remove`, `restart`, and `status` resolve an app from anywhere. You do
  not have to be standing in the right repository, and `rive list` will show you
  apps you started elsewhere.

### The branch-name collision

Because state is keyed by **branch name alone**, you cannot run the same branch
name in two repositories at the same time:

```bash
cd ~/code/my-api  && rive add feature/login   # works
cd ~/code/my-web  && rive add feature/login   # Error: already running
```

This bites hardest with common names — `main`, `develop`, `staging`. Until state
is keyed by repository as well as branch, the workarounds are:

- Use distinct branch names across repos, or
- Give each repository its own state with a per-project `.env`:
  ```bash
  # ~/code/my-web/.env
  RIVE_STATE_FILE=/Users/you/.rive/my-web/state
  RIVE_CURRENT_FILE=/Users/you/.rive/my-web/current
  ```
  Note both variables are needed — see the note above. Ports still come from the
  same range, so raise `RIVE_START_PORT` in one of them if you want the two sets
  kept apart.

`rive status` is the quickest way to see which repository an app belongs to.

## Validation

Rive validates configuration at startup and fails fast with a clear message if:

- `RIVE_START_PORT` is not numeric, or falls outside 1024–65535
- `RIVE_WORKTREE_DIR` is not an absolute path, or is not writable
- `RIVE_SERVER_COMMAND` does not contain the `%PORT%` placeholder
- The directory holding `RIVE_STATE_FILE` is not writable
