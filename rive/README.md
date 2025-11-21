# Rive - Ephemeral Review App Manager

Lightweight CLI tool for managing ephemeral review applications. Creates isolated git worktrees for branches and launches development servers on auto-allocated ports.

## Quick Start

```bash
# Create a review app
rive create feature/new-ui
# → Creates worktree, starts server on port 40000
# → Automatically sets as current app

# Navigate to the worktree (add alias: alias rivecd='cd $(rive cd)')
rivecd

# Pull latest changes
rive pull

# View server logs
rive logs

# List all running apps
rive list

# Stop when done
rive stop
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

See [docs/installation.md](docs/installation.md) for alternative methods.

## Key Features

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
create <branch>      Create review app (aliases: new, start, add, up)
list                 List all running apps
stop [branch|port]   Stop app (aliases: del, delete, remove, down)
restart [branch]     Restart app
cd [branch|port]     Print worktree path
pull [branch|port]   Pull latest changes
logs [branch|port]   Tail server logs
use [branch|port]    Set/show current app
config               Show configuration
clean                Clean stale entries
```

See [docs/commands.md](docs/commands.md) for detailed command reference.

## Workflow Example

```bash
# Start working on a feature
rive create feature/checkout-flow
# → Worktree created, server running, set as current

# Make some changes, test them
rivecd  # Navigate to worktree (using alias)
# ... edit files ...

# Pull latest from remote
rive pull

# Check logs if needed
rive logs

# Work on another feature while keeping first one running
rive create feature/user-profile
# → New server on port 40001, now current

# Switch back to first feature
rive use feature/checkout-flow

# Stop both when done
rive stop feature/checkout-flow
rive stop feature/user-profile
```

## Troubleshooting

**Server won't start?**
```bash
RIVE_ENABLE_LOGS=true rive create feature/branch
rive logs feature/branch
```

**Can't pull?**
```bash
# Ensure branch has upstream tracking
git push -u origin <branch>
```

See [docs/troubleshooting.md](docs/troubleshooting.md) for more help.

## Documentation

- [Installation Guide](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Command Reference](docs/commands.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
