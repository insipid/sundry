# Rive Changelog

## v1.0.0 - 2025-11-24

**Initial release of rive - ephemeral review app manager**

### Overview

Rive is a lightweight CLI tool for managing ephemeral review applications. It creates isolated git worktrees for branches and launches development servers on auto-allocated ports, making it easy to work on multiple features simultaneously without port conflicts or switching branches.

### Core Features

#### Worktree Management
- **Automatic worktree creation** from git branches
- **Repository namespacing** - organize worktrees by repo name
- **Smart cleanup** - auto-removes clean worktrees, preserves uncommitted work
- **Dirty worktree detection** - warns before removing work in progress

#### Process Management
- **Automatic port allocation** starting from configurable base port (default: 40000)
- **Port conflict detection** - prevents collisions with existing apps
- **Process tracking** with PID management
- **State persistence** across terminal sessions
- **Stale entry cleanup** for crashed/orphaned processes

#### Commands
- `create/start/new/add/up` - Create and start review app
- `list/ls` - Show all running apps with status, uptime, and details
- `stop/delete/remove/down` - Stop app and cleanup worktree
- `restart` - Restart existing app on same port
- `cd` - Navigate to app's worktree directory
- `pull` - Pull latest changes from remote
- `logs` - Tail server log output
- `use` - Set/show current app context
- `config` - Display current configuration
- `clean` - Remove stale state entries

#### Current App Context
- **Auto-set on creation** - newly created apps become current
- **Commands without arguments** - cd, pull, logs, stop, restart use current app
- **Clear on stop** - automatically cleared when stopping current app
- **Manual management** - `rive use <branch>` to switch, `rive use --clear` to clear

#### Configuration System
- **Three-tier precedence**: CLI flags > .env file > environment variables
- **Framework examples** for Node.js, Python, Django, Flask, Rails, Go
- **Flexible server commands** with `%PORT%` and `%HOSTNAME%` placeholders
- **Optional dependency auto-install** with package manager detection
- **Optional logging** to `.rive-server.log` in worktree

### Documentation

#### User Guides
- **README.md** - Quick start and workflow examples
- **docs/installation.md** - Installation methods and shell aliases
- **docs/configuration.md** - All config options with framework examples
- **docs/commands.md** - Complete command reference with examples
- **docs/troubleshooting.md** - Common issues and solutions

#### Configuration
- **`.env.example`** - Template with all available options
- **Inline help** - `rive help` shows usage and examples
- **Version command** - `rive version` for debugging

### Technical Details

#### Implementation
- **Language**: Bash 4.0+
- **Architecture**: Modular library design (890 lines across 6 modules)
- **Dependencies**: Git, lsof, standard Unix tools
- **Line count**: ~2,200 lines total (code + docs)

#### Library Modules
- `config.sh` - Configuration loading and precedence
- `state.sh` - State file management and persistence
- `port.sh` - Port allocation and conflict detection
- `worktree.sh` - Git worktree operations
- `process.sh` - Server process management
- `utils.sh` - Logging, error handling, dependencies

### Development Journey

This release represents 15 commits of iterative development:

**Phase 1: Core Implementation**
- Initial worktree and process management
- Port allocation and state tracking
- Basic commands (create, list, stop, restart)

**Phase 2: Git Integration**
- Upstream tracking configuration
- Pull command with proper remote handling
- Fixed various git edge cases (local branches, missing upstreams)

**Phase 3: User Experience**
- Current app context with `use` command
- Auto-set current app on creation
- Log files with `logs` command and `RIVE_ENABLE_LOGS` config
- Smart cleanup (ignore `.rive-server.log` in dirty checks)

**Phase 4: Documentation**
- Comprehensive README with workflow examples
- Separate detailed documentation guides
- Framework-specific configuration examples
- Troubleshooting guide with solutions
- Installation guide with shell alias recommendations

### Known Limitations

- No automated tests (manual testing used for v1.0)
- No package manager distribution (manual installation)
- Single machine only (no remote deployment)
- Bash 4.0+ required (not compatible with older bash versions)

### Future Considerations

These features were considered but deferred beyond v1.0:

- Package manager distribution (Homebrew, apt, etc.)
- Automated test suite (shellcheck, integration tests)
- Status command for detailed single-app info
- GIF demos in README
- Multi-service support
- Remote deployment capabilities

### Installation

```bash
# Clone the repository
git clone https://github.com/insipid/sundry.git
cd sundry

# Symlink to PATH
ln -s $(pwd)/rive/bin/rive ~/bin/rive

# Or add to shell config
echo 'alias rive="$(pwd)/rive/bin/rive"' >> ~/.bashrc

# Verify
rive version
```

### Credits

Developed as part of the sundry repository - a collection of miscellaneous scripts and tools.

---

**License**: MIT
