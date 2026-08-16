# Rive - Ephemeral Review App Manager

Lightweight CLI tool for managing ephemeral review applications. Creates isolated git worktrees for branches and launches development servers on auto-allocated ports.

## Quick Start

```bash
# Create a review app - pick a branch interactively
rive add
# → Shows a branch picker (fzf if installed, numbered menu otherwise)
# → Creates worktree, starts server on port 40000
# → Automatically sets as current app

# Or name the branch directly
rive add feature/new-ui

# Navigate to the worktree (add alias: alias rivecd='cd $(rive cd)')
rivecd

# Pull latest changes
rive pull

# View server logs
rive logs

# List all running apps
rive list

# Stop when done
rive remove
# → Stops server, removes worktree if clean
```

## Installation

```bash
# Clone the repo
cd ~/code
git clone https://github.com/insipid/sundry.git

# Symlink the executable
ln -s ~/code/sundry/rive/bin/rive ~/bin/rive

# Verify
rive version
```

Optionally install [fzf](https://github.com/junegunn/fzf) for fuzzy branch selection:

```bash
brew install fzf   # macOS
```

See [docs/installation.md](docs/installation.md) for alternative methods.

## Key Features

- **Interactive branch selection** - Run `rive add` with no argument to pick from a list
- **Auto worktree management** - One command creates isolated workspace
- **Port allocation** - Never worry about port conflicts
- **Current app context** - Commands work without specifying branch/port
- **Smart cleanup** - Auto-removes worktrees (preserves uncommitted work)
- **Repository namespacing** - Works across multiple repos
- **Log tracking** - Optional server output logging

## Configuration

Create a `.env` file in your project:

```bash
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
RIVE_ENABLE_LOGS=true
RIVE_AUTO_INSTALL=true
```

See [docs/configuration.md](docs/configuration.md) for all options and framework-specific commands.

## Commands

```
add [branch]         Create review app; prompts for branch if omitted
                     (aliases: start, create, new, up)
remove [branch|port] Stop app (aliases: stop, delete, del, down, rm)
list                 List all running apps (aliases: ls, l)
restart [branch]     Restart app
cd [branch|port]     Print worktree path
pull [branch|port]   Pull latest changes
logs [branch|port]   Tail server logs
use [branch|port]    Set/show current app
config               Show configuration
clean                Clean stale entries
help                 Show help message
version              Show version
```

See [docs/commands.md](docs/commands.md) for detailed command reference.

## Interactive Branch Selection

Omit the branch name and rive shows a picker:

```bash
rive add
```

The list includes local branches and any remote branches without a local
counterpart, annotated so you can see the state at a glance:

```
  1) main (current)
  2) feature/checkout-flow [worktree: ~/.rive/worktrees/myrepo/checkout-flow]
  3) origin/feature/user-profile (remote)
```

- `(current)` - the branch checked out in your main working directory
- `(remote)` - exists only on a remote; rive creates the local branch for you
- `[worktree: ...]` - already has a worktree

If [fzf](https://github.com/junegunn/fzf) is installed you get a fuzzy-filterable
list; otherwise rive falls back to a numbered menu. Any remote name works, not
just `origin`.

`rive use` with no argument offers the same picker when apps are running.

## Workflow Example

```bash
# Start working on a feature
rive add feature/checkout-flow
# → Worktree created, server running, set as current

# Make some changes, test them
rivecd  # Navigate to worktree (using alias)
# ... edit files ...

# Pull latest from remote
rive pull

# Check logs if needed
rive logs

# Work on another feature while keeping first one running
rive add feature/user-profile
# → New server on port 40001, now current

# Switch back to first feature
rive use feature/checkout-flow

# Stop both when done
rive remove feature/checkout-flow
rive remove feature/user-profile
```

## Troubleshooting

**Server won't start?**
```bash
RIVE_ENABLE_LOGS=true rive add feature/branch
rive logs feature/branch
```

**Can't pull?**
```bash
# Ensure branch has upstream tracking
git push -u origin <branch>
```

See [docs/troubleshooting.md](docs/troubleshooting.md) for more help.

## Development

```bash
# Lint (matches CI)
shellcheck --severity=warning bin/rive lib/*.sh test/lifecycle_test.sh

# Unit tests - library functions in isolation (requires bats-core)
bats test/rive.bats

# Lifecycle tests - drives the real CLI end to end (bash + git only)
./test/lifecycle_test.sh
```

The two suites do different jobs. `rive.bats` unit-tests the library functions.
`lifecycle_test.sh` runs the actual CLI against a throwaway git repository —
creating real worktrees, spawning and killing real server processes, and
asserting against the filesystem, process table, and state file. It takes about
a minute and cleans up after itself, including on failure.

CI runs ShellCheck plus both suites on Ubuntu and macOS for every push and pull
request touching `rive/`.

## Documentation

- [Installation Guide](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Command Reference](docs/commands.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Changelog](CHANGELOG.md)

## License

MIT
