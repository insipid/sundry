# Troubleshooting

## "No such file or directory: .../lib/utils.sh" on startup

**Error:**
```
/Users/you/bin/rive: line 12: /Users/you/lib/utils.sh: No such file or directory
```

**Cause:** A bug in v1.0.0. Rive looked for its `lib/` directory next to the
symlink you invoked rather than next to the real script, so the documented
symlink installation broke on every run.

**Solution:** Update to v1.1.0 or later:
```bash
cd ~/code/sundry
git pull
rive version    # should report 1.1.0 or higher
```

## "Port already in use" or "No available ports found" error

**Possible causes:**
- Too many review apps running
- Other services using ports in the configured range
- Stale state entries from crashed processes

**Solutions:**
```bash
# Check how many apps are running
rive list

# Clean up stale entries from crashed processes
rive clean

# Use a different starting port
rive --start-port 50000 add feature/branch

# Or set permanently in .env
echo "RIVE_START_PORT=50000" >> .env
```

## "Branch not found" error

**Solution:** Fetch latest branches:
```bash
git fetch --all
rive add feature/branch
```

## Server won't start

**Solution 1:** Enable log files to capture server output:
```bash
# Enable logs for all servers
RIVE_ENABLE_LOGS=true rive add feature/branch

# Then check the log file
rive logs feature/branch
# or
tail -f ~/.rive/worktrees/<repo>/<branch>/.rive-server.log
```

**Solution 2:** Use verbose mode for immediate debugging:
```bash
# Run in verbose mode
rive --verbose add feature/branch
```

**Additional debugging:**
```bash
# Verify configuration
rive config

# Test the command manually in the worktree
rivecd feature/branch  # or: cd $(rive cd feature/branch)
npm run dev -- --port 40000
```

**Common issues:**
- Missing dependencies (try `RIVE_AUTO_INSTALL=true`)
- Wrong server command for your framework
- Port already in use
- Server requires additional environment variables

## Worktree creation failed

**Error:** `fatal: '/path/to/worktree' is a missing but already registered worktree`

**Cause:** Git has a stale worktree registration (the directory was deleted without using `git worktree remove`)

**Solution:** Clean up stale worktree registrations:
```bash
git worktree prune
```

**Other solutions:**
```bash
# Check permissions
ls -la ~/.rive/

# Or use a different directory
export RIVE_WORKTREE_DIR=/tmp/rive-worktrees
```

## Git pull fails with "no such ref was fetched"

**Cause:** The remote branch doesn't exist on GitHub (it may have been deleted or merged)

**Solution:** Verify the branch exists:
```bash
git ls-remote origin | grep branch-name
```

If it doesn't exist, you can't pull. If it does exist but pull still fails, try:
```bash
rivecd feature/branch
git fetch --prune
git pull
```

## Selecting the branch you already have checked out

Since v1.1.0 this is handled for you: if you pick the branch that is checked out
in your main working directory, rive skips worktree creation and starts the
server in the repository root instead. You will see:

```
Selected branch 'main' is the current branch
Starting server in current directory...
```

**Error:** "Branch 'X' is currently checked out in the main working directory"

**Cause:** Git cannot create a worktree for a branch that's already checked out
somewhere. You can still hit this if the branch is checked out in *another*
worktree.

**Solution:** Find where it is checked out and switch that worktree to a
different branch, or pick a different branch:
```bash
git worktree list
```

## Interactive branch picker isn't fuzzy-searchable

**Cause:** [fzf](https://github.com/junegunn/fzf) is not installed, so rive falls
back to a numbered menu.

**Solution:** Install fzf:
```bash
brew install fzf          # macOS
sudo apt install fzf      # Debian/Ubuntu
```

Both interfaces work — fzf just adds type-to-filter.

## "Invalid branch name" error

**Cause:** Rive rejects branch names containing shell metacharacters (`;`,
`` ` ``, `|`, `..` and similar) before passing them to git. This is a
deliberate safety check, not a git error.

**Solution:** Use a branch name made up of letters, numbers, `/`, `-`, `_`, and
`.` (single dots). Check the exact name with:
```bash
git branch --list
```

## Terminal hangs or becomes unresponsive

**Cause:** (Fixed in current version) This was caused by verbose mode not properly detaching the server process

**Solution:** Update to the latest version. If still occurring:
- Press Ctrl+Z to suspend
- Type `jobs` to see background jobs
- Type `kill %1` (or appropriate job number)

## Review app stops immediately after creation

**Cause:** The server command is failing immediately

**Solution:** Enable verbose mode or logs to see the error:
```bash
RIVE_ENABLE_LOGS=true rive add feature/branch
rive logs feature/branch
```

Common causes:
- Missing `node_modules` (try `RIVE_AUTO_INSTALL=true`)
- Wrong port flag for your framework
- Server requires environment variables

## State file corruption

**Symptoms:** Commands fail with parsing errors or show incorrect information

**Solution:** Clean up and restart:
```bash
# Backup current state
cp ~/.rive/state ~/.rive/state.backup

# Clean stale entries
rive clean

# Or manually reset (loses all state)
rm ~/.rive/state
```

## Can't remove dirty worktree

**Error:** "Worktree has uncommitted changes, keeping it"

**Solution:** Decide what to do with the changes:

```bash
# Option 1: Commit the changes
rivecd feature/branch
git add .
git commit -m "WIP"

# Option 2: Discard the changes
rivecd feature/branch
git reset --hard
git clean -fd

# Option 3: Stash the changes
rivecd feature/branch
git stash

# Then remove manually
git worktree remove /path/to/worktree
```

## Getting Help

If you encounter an issue not listed here:

1. Check the configuration: `rive config`
2. Enable verbose mode: `rive --verbose add <branch>`
3. Check logs: `rive logs <branch>` (if enabled)
4. File an issue on GitHub with:
   - The command you ran
   - The full error output
   - Your OS and git version
   - Your configuration (from `rive config`)
