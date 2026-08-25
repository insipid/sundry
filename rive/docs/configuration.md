# Configuration

Rive loads configuration from multiple sources with the following precedence:

1. **CLI flags** (highest priority)
2. **`.rive.env` file** in current directory
3. **`.env` file** in current directory
4. **Environment variables** (lowest priority)

Each source overrides the ones below it **key by key**, so a `.rive.env` that
sets only `RIVE_START_PORT` still leaves every other value coming from `.env`.
Only variables named `RIVE_*` are read; anything else in the files is ignored.

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

## Creating a Config File

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

### `.rive.env` — keeping rive settings separate

Most projects already have a `.env`, and it usually belongs to the application
rather than to your tooling. `.rive.env` gives rive a file of its own:

```bash
# .rive.env — read after .env, so these win
RIVE_START_PORT=42000
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

Use it when you want to:

- **Keep rive out of a shared `.env`** that is committed, or generated, or
  owned by the application
- **Override just a few keys** for one checkout, leaving the rest of `.env`
  in force
- **Keep local preferences uncommitted** — add `.rive.env` to `.gitignore`
  while `.env` stays tracked

Both files are optional, and both are read from the directory you run `rive`
in, not from the repository root.

## Exporting Configuration

You can export the current configuration to a file:

```bash
# Save configuration to a file
rive config > my-config.env

# Source it in your shell
source my-config.env

# Or use it as .env
cp my-config.env .env

# Or as the rive-specific file, which takes precedence over .env
cp my-config.env .rive.env
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

rive is repo-aware. Apps are identified by **(repository, branch)**, so the same
branch name can run in as many repositories as you like:

```bash
cd ~/code/my-api && rive add feature/login   # port 40000
cd ~/code/my-web && rive add feature/login   # port 40001, no conflict
```

Repositories are identified by the absolute path of their main working
directory, so `~/work/api` and `~/oss/api` are correctly treated as different
repositories despite sharing a name.

### Scope

By default every command acts on **the repository you are standing in**:

```bash
rive list              # apps in this repository
rive list --global     # apps everywhere, with a REPO column
```

Widen a single command with `--global` (`-G`), or its aliases `--all` (`-a`).
The flag can go anywhere on the line — `rive list --global` and
`rive --global list` are the same.

Outside a git repository, "local" has nothing to mean, so rive uses global
scope automatically. `rive add` and `rive pull` still require a repository,
since they need one to work with.

Set the default yourself with `RIVE_DEFAULT_SCOPE`:

```bash
# ~/.rive.env, your shell profile, or a project .env
RIVE_DEFAULT_SCOPE=global
```

It follows the usual precedence — a `--global` flag beats `.env`, which beats
the environment — so a project that wants global by default can say so in its
own `.env` while everything else stays local.

### Naming an app in another repository

Prefix with the repository name:

```bash
rive status my-web:feature/login
rive remove my-api:feature/login
```

Git forbids colons in branch names, so the separator is never ambiguous. This
works from anywhere, including outside a repository, and needs no flag.

If a bare name matches apps in several repositories, rive lists them rather than
guessing:

```
Error: 'feature/login' matches review apps in 2 repositories:
  my-api:feature/login (port 40000)
  my-web:feature/login (port 40001)
Name one of them, or use its port.
```

Ports are unique across every repository, so `rive status 40001` always resolves
without a flag or a prefix.

### What is shared and what is not

| | Scope |
|---|---|
| Worktree directories | per repository (`~/.rive/worktrees/<repo>/<branch>`) |
| App identity | per repository — `(repo, branch)` |
| Current app | **per repository** — each repo remembers its own |
| Port allocation | **global**, deliberately: it is what stops two repositories colliding on a port |
| State file | one file, with each entry recording its repository |

### Upgrading

Nothing to do. Entries written by an earlier rive have no repository recorded;
the first command you run derives it from the app's worktree and rewrites the
entry. A current-app pointer in the old format is honoured as-is and migrated
the next time it changes.

## Validation

Rive validates configuration at startup and fails fast with a clear message if:

- `RIVE_START_PORT` is not numeric, or falls outside 1024–65535
- `RIVE_WORKTREE_DIR` is not an absolute path, or is not writable
- `RIVE_SERVER_COMMAND` does not contain the `%PORT%` placeholder
- The directory holding `RIVE_STATE_FILE` is not writable
