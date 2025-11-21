# Installation

## Requirements

- Bash 4.0+
- Git
- Basic Unix tools (lsof, ps, grep, etc.)

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

The symlink will automatically point to the updated version.
