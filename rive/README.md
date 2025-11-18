# Rive - Ephemeral Review App Manager

Rive is a lightweight CLI tool for managing ephemeral review applications in git repositories. It creates isolated git worktrees for branches and launches development servers on automatically allocated ports.

## Features

- **Automatic Worktree Management**: Creates isolated git worktrees for each branch
- **Smart Port Allocation**: Automatically finds available ports to avoid conflicts
- **Simple Configuration**: Configure via environment variables, `.env` files, or CLI flags
- **Process Management**: Start, stop, restart, and monitor review app servers
- **Quick Navigation**: Jump to review app directories with the `cd` command

## Installation

### Quick Install

```bash
# Clone the repository
git clone <repo-url>

# Add to PATH
export PATH="$PATH:/path/to/rive/bin"

# Or create a symlink
ln -s /path/to/rive/bin/rive /usr/local/bin/rive

# Verify installation
rive version
```

### Prerequisites

- Git 2.5+ (with worktree support)
- Bash 4.0+
- `lsof` command (for port checking)

## Quick Start

```bash
# Create a review app from a branch
rive create feature/new-ui

# List all running review apps
rive list

# Stop a review app
rive stop feature/new-ui

# Navigate to a review app's directory
cd $(rive cd feature/new-ui)
```

## Configuration

Rive loads configuration from multiple sources with the following precedence:

1. **CLI flags** (highest priority)
2. **`.env` file** in current directory
3. **Environment variables** (lowest priority)

### Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RIVE_START_PORT` | `40000` | Starting port for allocation |
| `RIVE_WORKTREE_DIR` | `~/.rive/worktrees` | Base directory for worktrees |
| `RIVE_SERVER_COMMAND` | `npm run dev -- --port %PORT%` | Server command (`%PORT%` is replaced) |
| `RIVE_STATE_FILE` | `~/.rive/state` | State file location |
| `RIVE_AUTO_INSTALL` | `false` | Auto-install dependencies |
| `RIVE_INSTALL_COMMAND` | _(auto-detected)_ | Custom install command |
| `RIVE_VERBOSE` | `false` | Enable verbose output |

### Example .env File

```bash
# .env
RIVE_START_PORT=40000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
RIVE_AUTO_INSTALL=true
```

### Framework-Specific Commands

**Node.js (npm/yarn/pnpm):**
```bash
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
RIVE_SERVER_COMMAND="yarn dev --port %PORT%"
RIVE_SERVER_COMMAND="pnpm dev --port %PORT%"
```

**Python (Django/Flask):**
```bash
RIVE_SERVER_COMMAND="python manage.py runserver 0.0.0.0:%PORT%"
RIVE_SERVER_COMMAND="FLASK_RUN_PORT=%PORT% flask run"
```

**Ruby on Rails:**
```bash
RIVE_SERVER_COMMAND="rails server -p %PORT%"
```

**Go:**
```bash
RIVE_SERVER_COMMAND="PORT=%PORT% go run main.go"
```

## Commands

### create

Create a new review app from a git branch.

```bash
rive create <branch>

# Examples
rive create feature/user-auth
rive create bugfix/login-error
```

**What happens:**
1. Validates branch exists (fetches if needed)
2. Finds an available port
3. Creates a git worktree
4. Optionally installs dependencies
5. Starts the development server
6. Saves state for management

### list

List all running review apps.

```bash
rive list
```

**Output:**
```
BRANCH                      PORT    STATUS     UPTIME      WORKTREE
────────────────────────────────────────────────────────────────────
feature/user-auth          40000   running    2h 15m      /tmp/rive/user-auth
bugfix/login-error         40001   running    45m         /tmp/rive/login-error
```

### stop

Stop a running review app.

```bash
rive stop <branch|port>

# Examples
rive stop feature/user-auth    # Stop by branch name
rive stop 40000                # Stop by port number
```

**Note:** The worktree is preserved by default. Remove it manually with:
```bash
git worktree remove <path>
```

### restart

Restart an existing review app.

```bash
rive restart <branch>

# Example
rive restart feature/user-auth
```

Maintains the same port and worktree, just restarts the server process.

### cd

Print the path to a review app's worktree (for use with shell `cd`).

```bash
cd $(rive cd <branch|port>)

# Examples
cd $(rive cd feature/user-auth)
cd $(rive cd 40000)
```

**Pro tip:** Create a shell function for easier use:
```bash
# Add to ~/.bashrc or ~/.zshrc
rivecd() {
    cd "$(rive cd "$1")"
}

# Usage
rivecd feature/user-auth
```

### config

Show current configuration.

```bash
rive config
```

### clean

Clean up stale state entries (processes that are no longer running).

```bash
rive clean
```

## Use Cases

### Parallel Feature Development

Work on multiple features simultaneously without branch switching:

```bash
rive create feature/header-redesign
rive create feature/footer-update
rive list
# Both running on different ports
```

### Code Review

Quickly test a PR before merging:

```bash
rive create origin/pull/123/head
# Review at http://localhost:40000
rive stop origin/pull/123/head
```

### Bug Reproduction

Create isolated environments for debugging:

```bash
rive create bugfix/issue-456
cd $(rive cd bugfix/issue-456)
# Debug in isolation
```

## Troubleshooting

### "Port already in use" error

**Solution:** The automatic port allocation failed. Try:
```bash
# Use a different starting port
rive --start-port 50000 create feature/branch
```

### "Branch not found" error

**Solution:** Fetch latest branches:
```bash
git fetch --all
rive create feature/branch
```

### Server won't start

**Solution:** Check the server command is correct:
```bash
# Verify configuration
rive config

# Try running the command manually in the worktree
cd $(rive cd feature/branch)
npm run dev -- --port 40000
```

### Worktree creation failed

**Solution:** Ensure the worktree directory is writable:
```bash
# Check permissions
ls -la ~/.rive/

# Or use a different directory
export RIVE_WORKTREE_DIR=/tmp/rive-worktrees
```

## Architecture

```
rive/
├── bin/
│   └── rive           # Main CLI executable
├── lib/
│   ├── utils.sh       # Utility functions
│   ├── config.sh      # Configuration management
│   ├── state.sh       # State file management
│   ├── port.sh        # Port allocation
│   ├── worktree.sh    # Git worktree operations
│   └── process.sh     # Process management
└── tests/
    └── ...            # Test files
```

## Development

See the [BUILD document](../docs/2025-11-18-1556_BUILD_rive-cli.md) for the original requirements and specifications.

### Running Tests

```bash
cd rive/tests
bash run_tests.sh
```

## Limitations

- One review app per branch
- Review apps don't auto-restart after system reboot
- No built-in SSL/HTTPS support
- Single-service only (no multi-container support)

## Contributing

Contributions are welcome! Please:

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Test on both Linux and macOS

## License

TBD

## Credits

Created based on the specifications in the [Rive CLI Product Requirements Document](../docs/2025-11-18-1556_BUILD_rive-cli.md).
