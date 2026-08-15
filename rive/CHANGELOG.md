# Rive Changelog

## v1.1.0 - 2026-08-15

**Interactive branch selection, hardening, and a test suite in CI**

### Overview

The headline change is that `rive add` no longer requires a branch name — run it
bare and pick from a list. Alongside that, this release adds input validation and
error handling throughout, a BATS unit suite, an integration suite, and GitHub
Actions CI running ShellCheck and tests on both Ubuntu and macOS.

### Added

#### Interactive branch selection
- **`rive add` with no argument** opens a branch picker
- **fzf support** — fuzzy type-to-filter selection when `fzf` is on `PATH`
- **Numbered-menu fallback** when fzf is not installed, so the feature degrades
  gracefully rather than failing
- **Remote branches included** — remote branches with no local counterpart appear
  in the list marked `(remote)`, and the local branch is created on selection
- **Any remote supported**, not just `origin`
- **Status annotations** — entries are marked `(current)` for the checked-out
  branch and `[worktree: path]` where a worktree already exists
- **`rive use` with no argument** offers the same picker when apps are running

#### Testing and CI
- **BATS unit suite** (`test/rive.bats`)
- **Integration suite** (`test/integration_test.sh`) — 37 tests covering config
  validation, state management, port allocation, branch-name sanitisation,
  process handling, and CLI smoke tests; requires no dependencies beyond Bash
- **GitHub Actions workflow** (`.github/workflows/rive-ci.yml`) running ShellCheck
  at `--severity=warning` plus the BATS suite on `ubuntu-latest` and `macos-latest`

#### Safety and error handling
- **Branch name validation** rejecting shell metacharacters (`;`, `` ` ``, `|`,
  `..`) before values reach git
- **Path validation** for the worktree directory and state file, checking
  writability up front
- **Configuration validation** — numeric and in-range `RIVE_START_PORT`, absolute
  `RIVE_WORKTREE_DIR`, and a required `%PORT%` placeholder in `RIVE_SERVER_COMMAND`

### Changed

- **`add` and `remove` are now the canonical command names**, replacing `create`
  and `stop` in documentation and help output. All previous names remain as
  aliases, so existing scripts and muscle memory keep working:
  - `add` — aliases `start`, `create`, `new`, `up`
  - `remove` — aliases `stop`, `delete`, `del`, `down`, `rm`
- **New aliases** `l` (for `list`) and `rm` (for `remove`)
- **Selecting the current branch no longer errors.** `rive add <current-branch>`
  now starts the server in the repository root instead of refusing to create a
  worktree
- **`rive help` lists all configuration variables**, including the previously
  omitted `RIVE_HOSTNAME`, `RIVE_STATE_FILE`, `RIVE_INSTALL_COMMAND`, and
  `RIVE_ENABLE_LOGS`

### Fixed

- **Branch picker prompts now write to stderr**, so command substitution such as
  `cd $(rive cd)` is not polluted by menu output
- **Local branches containing slashes** are no longer misidentified as remote
  branches
- **Remote entries without a slash** are filtered out of the branch list
- **Subshell variable scoping** in branch filtering, which caused branches to be
  dropped from the list
- **Branch lookup performance** — `git worktree list` is now called once and
  cached in a map rather than once per branch
- **printf format string** handling in the numbered menu
- **ShellCheck warnings** across `bin/rive` and all library modules, including
  SC2120 in `load_env_file`

### Dependencies

- **`fzf` is now an optional dependency.** Installing it improves branch
  selection; omitting it changes nothing else.

### Upgrading from v1.0.0

No breaking changes. Pull the latest and confirm with `rive version`. Existing
state files, worktrees, and `.env` configuration are unaffected. If you have
scripts calling `rive create` or `rive stop`, they continue to work unchanged.

---

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
- `create/add/start/new/up` - Create and start review app
- `list/ls/l` - Show all running apps with status, uptime, and details
- `remove/stop/delete/del/down/rm` - Stop app and cleanup worktree
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
- **Architecture**: Modular library design across 6 modules
- **Dependencies**: Git, lsof, standard Unix tools

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

- No package manager distribution (manual installation)
- Single machine only (no remote deployment)
- Bash 4.0+ required (not compatible with older bash versions)

### Future Considerations

These features were considered but deferred beyond v1.0:

- Package manager distribution (Homebrew, apt, etc.)
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
