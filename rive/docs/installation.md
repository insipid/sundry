# Installation

## Requirements

**Required:**

- Bash 4.0+ (macOS ships with Bash 3.2 — install a newer Bash with `brew install bash`)
- Git
- Basic Unix tools (lsof, ps, grep, etc.)

**Optional:**

- [fzf](https://github.com/junegunn/fzf) — enables fuzzy branch selection for
  `rive add`. Without it, rive falls back to a numbered menu, so nothing breaks
  if it is missing.

  ```bash
  brew install fzf          # macOS
  sudo apt install fzf      # Debian/Ubuntu
  ```

**For development only:**

- [bats-core](https://github.com/bats-core/bats-core) — unit test suite
  (`brew install bats-core`)
- [ShellCheck](https://www.shellcheck.net/) — linting (`brew install shellcheck`)

## Quick Install

1. **Clone the repository:**
   ```bash
   cd ~/code  # or wherever you keep your code
   git clone https://github.com/insipid/sundry.git
   ```

2. **Create a symlink to the executable:**
   ```bash
   ln -s ~/code/sundry/rive/bin/rive ~/bin/rive
   ```

   Or if `~/bin` isn't in your PATH, use `/usr/local/bin`:
   ```bash
   sudo ln -s ~/code/sundry/rive/bin/rive /usr/local/bin/rive
   ```

3. **Verify installation:**
   ```bash
   rive version
   ```

## Alternative: Bash Function

Instead of symlinking, you can add a bash function to your `~/.bashrc` or `~/.zshrc`:

```bash
rive() {
    ~/code/sundry/rive/bin/rive "$@"
}
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Helpful Shell Aliases

Add these to your `~/.bashrc` or `~/.zshrc` for easier navigation:

```bash
# Navigate to current app's worktree
alias rivecd='cd $(rive cd)'

# Or with argument support
rivecd() {
    cd "$(rive cd "$@")"
}
```

Usage:
```bash
rivecd                    # cd to current app
rivecd feature/new-ui     # cd to specific app
```

## Updating

To update to the latest version:

```bash
cd ~/code/sundry
git pull
```

The symlink will automatically point to the updated version. Check what you are
running with:

```bash
rive version
```

## Running the Tests

From the `rive/` directory:

```bash
# Lint (matches CI)
shellcheck --severity=warning bin/rive lib/*.sh test/lifecycle_test.sh

# Unit tests - library functions in isolation (requires bats-core)
bats test/rive.bats

# Lifecycle tests - drives the real CLI end to end (bash + git only)
./test/lifecycle_test.sh
```

The lifecycle suite creates real worktrees and spawns real processes inside a
temporary directory, then removes them — including if a test fails or you
interrupt it. It never touches your own `~/.rive` state or repositories, and
refuses to run if its state file would fall outside the temp tree.

On macOS the branch-picker tests need bash 4+ (`brew install bash`); they skip
themselves on the system bash 3.2 rather than failing.
