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

```bash
# Use a different starting port
rive --start-port 50000 create feature/branch

# Use a different worktree directory
rive --worktree-dir /tmp/rive create feature/branch

# Enable verbose mode
rive --verbose create feature/branch
# or
rive -v create feature/branch
```
