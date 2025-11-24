# Rive Development Log

## Project Genesis

Rive was created to solve a common development workflow problem: managing multiple feature branches with running development servers without port conflicts or constantly switching branches.

The goal was a simple CLI tool that "just works" - no complex configuration, no heavy dependencies, just Bash and Git.

## Design Decisions

### Why Worktrees?

Git worktrees allow multiple branches to be checked out simultaneously in different directories. This is perfect for review apps because:
- No branch switching needed
- Each app is truly isolated
- Git handles the heavy lifting
- Easy cleanup when done

### Why Auto Port Allocation?

Manually managing ports is tedious and error-prone. Starting from 40000 and scanning upward:
- Stays out of the way of common services
- Sequential allocation is predictable
- Easy to remember (just add 1 for each app)

### Why Current App Context?

The `use` command was added after realizing most workflows focus on one app at a time. Being able to run `rive pull`, `rive logs`, `rive cd` without specifying the branch every time is a huge quality-of-life improvement.

### Why Optional Logging?

Server logs can be noisy and fill up disk space. Making them opt-in via `RIVE_ENABLE_LOGS` gives users control. The `.rive-server.log` file is automatically excluded from dirty checks so it doesn't prevent cleanup.

## Technical Challenges

### Git Pull in Worktrees

**Problem**: Running `git pull` in a worktree failed because worktrees don't inherit upstream tracking from the main repo.

**Attempted Solutions**:
1. Set upstream when creating worktree ❌ (worktree still couldn't find remote)
2. Copy upstream config ❌ (didn't persist correctly)
3. Add explicit fetch ❌ (still couldn't pull without upstream)

**Final Solution**: Query upstream from the main repo, then explicitly pull `remote/branch` in the worktree. No reliance on worktree's upstream config. Works every time.

### Verbose Mode Hanging Terminal

**Problem**: When using `--verbose`, the terminal would hang because the server process stayed attached to stdout.

**Solution**: Proper process detachment with `setsid` and output redirection to log files or `/dev/null`. The `rive logs` command can tail the log file separately.

### Dirty Worktree Cleanup

**Problem**: Worktrees with log files were always considered "dirty" and never auto-cleaned.

**Solution**: Explicitly exclude `.rive-server.log` when checking if worktree is clean. Since rive manages these files, it's safe to ignore them for cleanup purposes.

### State File Corruption

**Problem**: Concurrent access or crashes could corrupt the state file.

**Solution**: Simple line-based format that's resilient to partial writes. The `clean` command removes invalid entries. Each line is self-contained and parseable.

## Architecture

### Modular Design

Split into focused library modules:
- **config.sh**: Configuration precedence and loading
- **state.sh**: State persistence and queries
- **port.sh**: Port scanning and allocation
- **worktree.sh**: Git worktree operations
- **process.sh**: Server lifecycle management
- **utils.sh**: Shared utilities

Each module has a clear responsibility and can be tested independently.

### State Format

Simple pipe-delimited format for easy parsing:
```
branch|port|worktree_path|pid|timestamp|repo_name
```

No JSON dependency, easy to grep, resilient to partial updates.

### Error Handling

Every operation that can fail is checked. Cleanup happens automatically on errors. Users get actionable error messages with suggested fixes.

## What Worked Well

1. **Bash was the right choice** - No compilation, runs anywhere, easy to install
2. **Modular design** - Easy to debug and extend
3. **Comprehensive docs** - Users can self-serve most questions
4. **Command aliases** - `rive start`, `rive up`, `rive new` all work intuitively
5. **Current app context** - Makes the common case fast
6. **Smart cleanup** - Respecting uncommitted work prevents data loss

## What Could Be Better

1. **No tests** - Manual testing worked for v1.0 but is fragile
2. **Limited error recovery** - Some failures require manual cleanup
3. **No dry-run mode** - Can't preview what will happen
4. **No multi-service support** - Can only run one server per app
5. **Bash 4.0+ only** - Won't work on older macOS without upgrading

## Interesting Bugs Fixed

### The Missing PID Bug
Server would start but return empty PID, causing state corruption. Turned out verbose mode output was interfering with variable capture. Fixed by separating logging from return values.

### The Zombie Worktree Bug
Git would refuse to create worktrees for "missing but registered" directories. This happened when users manually deleted directories. Fixed by documenting `git worktree prune` and adding it to troubleshooting guide.

### The Upstream Tracking Mystery
Took several iterations to understand that worktrees need explicit remote/branch specification for `git pull` to work reliably. The solution of querying the main repo's upstream was elegant once discovered.

## Usage Patterns Observed

During development, these patterns emerged:

```bash
# Quick feature work
rive create feature/x
# ... work on feature ...
rive stop

# Multi-feature juggling
rive create feature/a
rive create feature/b
rive use feature/a
rive pull
rive logs
rive use feature/b
# ... switch back and forth ...

# The rivecd alias
alias rivecd='cd $(rive cd)'
rivecd  # instant navigation to current app
```

## Documentation Philosophy

- **Quick start first** - Get users running in 30 seconds
- **Examples over theory** - Show, don't tell
- **Framework-specific configs** - Don't make users translate
- **Troubleshooting guide** - Address real issues users will hit
- **Installation guide** - Multiple methods for different preferences

## Performance

Typical operations:
- `rive create` - 2-3 seconds (depends on repo size)
- `rive list` - <100ms
- `rive stop` - <500ms
- `rive cd` - <50ms
- `rive pull` - depends on git fetch

The tool is fast enough that performance isn't a concern.

## Code Statistics

```
   590  rive/bin/rive (main script)
   147  rive/lib/config.sh
   203  rive/lib/state.sh
    71  rive/lib/port.sh
   191  rive/lib/worktree.sh
   166  rive/lib/process.sh
   112  rive/lib/utils.sh
------
 1,480  total code lines

   138  rive/README.md
   195  rive/docs/commands.md
    93  rive/docs/configuration.md
    76  rive/docs/installation.md
   178  rive/docs/troubleshooting.md
------
   680  documentation lines
```

## What I'd Do Differently

If starting over:
1. **Add tests from the start** - Would catch bugs earlier
2. **Use JSON for state** - More robust, easier to extend (but adds dependency)
3. **Add completion scripts** - Bash/Zsh completion would be nice
4. **Namespaced config** - Support per-repo .rive.env files

## What I'd Keep

1. **Simple installation** - No package manager required
2. **Modular architecture** - Easy to maintain
3. **Current app context** - This feature is gold
4. **Smart defaults** - Works without configuration
5. **Comprehensive docs** - Users need this

## Future Roadmap (Beyond v1.0)

### v1.1 - Quality
- Add shellcheck to CI
- Basic integration tests
- Status command for detailed single-app info

### v1.2 - Distribution
- Homebrew formula
- Installation script
- Bash/Zsh completion

### v1.3 - Features
- Multi-service support (docker-compose)
- Remote deployment hooks
- Custom hooks (pre-create, post-stop)

### v2.0 - Architecture
- Plugin system
- JSON state format
- Web UI for managing apps

## Lessons Learned

1. **Start with docs** - Writing docs first clarified the UX
2. **Iterate on UX** - The `use` command came from real usage
3. **Test on real projects** - Found edge cases immediately
4. **Keep it simple** - Resisted adding complexity
5. **Error messages matter** - Good errors save support time

## Conclusion

Rive v1.0 is a solid, practical tool that solves a real problem. It's not perfect, but it's useful and reliable. The modular design and comprehensive documentation make it easy to maintain and extend.

The code is ready for prime time. Ship it! 🚀

---

**Total development time**: ~15 commits of iterative refinement
**Final verdict**: Feature-complete, well-documented, production-ready
