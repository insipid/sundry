# Design: `rive stop`

Stop a review app's server processes without tearing down its worktree, so it
can be restarted later without paying the cost of recreating the workspace.

## Problem

`rive remove` is the only way to stop a server, and it also deletes the state
entry and (if clean) the worktree. Anyone who just wants to free the port or
bounce a misbehaving server has to recreate the worktree afterwards.

`stop` is currently an alias for `remove`, so the obvious command for this does
the destructive thing.

Separately, `stop_server` kills only the PID rive recorded, which is the
`bash -c "$command"` wrapper. For a typical `RIVE_SERVER_COMMAND` such as
`npm run dev -- --port %PORT%`, the process actually bound to the port is a
grandchild. Killing the wrapper orphans it, it keeps the port, and the next
`restart` fails on a port collision. This is a latent bug in `remove` and
`restart` today, not something the new command introduces.

## Command surface

| Command | Behaviour |
| --- | --- |
| `stop [branch\|port]` | Stops the server. Keeps the worktree, the state entry, and the current-app pointer. |
| `stop --all` | Stops every running app. Mirrors `remove --all`. |
| `add` (`start`, `create`, `new`, `up`) | Creates the worktree if absent, then starts. Resumes a *stopped* app in place on its reserved port. Still refuses an app that is already running. |
| `restart` | Unchanged. Also resumes a stopped app. |
| `remove` (`delete`, `del`, `down`, `rm`) | Unchanged behaviour. Loses the `stop` alias. |

`stop` is a breaking change for anyone whose muscle memory expects it to remove
the worktree. It is called out in the changelog.

## Killing the whole process tree

`start_server` launches the server under bash job control so the job becomes a
process-group leader. A process group's ID is by definition the PID of its
leader, so the PID already stored in the state file doubles as the PGID and no
new state field is needed. `setsid` is not used because macOS does not ship it.

```
pid=$( set -m; nohup bash -c "$command" >"$log" 2>&1 & echo $! )
```

`stop_server_tree <pid> <port>` then:

1. Signals the group with `TERM` (`kill -TERM -$pid`), falling back to the bare
   PID when the group does not exist. The fallback covers entries written by an
   earlier version, whose PID is not a group leader.
2. Polls for up to 10 seconds, then escalates to `KILL` on the group and PID.
3. Sweeps the port: if `lsof -ti tcp:$port` still reports a listener, signals it
   `TERM` then `KILL`. Skipped where `lsof` is unavailable.

`stop_server` delegates to this, so `remove` and `restart` inherit the fix.

## Recording a stopped app

The state format stays `branch|port|worktree|pid|timestamp`; a stopped app is
written with a `-` in the PID field. Two existing behaviours must learn about
the sentinel, or `stop` would silently lose the app:

- `state_clean_stale` reaps entries whose PID is not running, and `rive list`
  calls it first — merely listing would delete a stopped app. It must keep `-`
  entries. Genuinely crashed apps are still reaped, as today.
- `is_port_allocated` treats a non-running PID as "port free", so a stopped
  app's port would be handed to the next `add` and the resume would collide. A
  `-` entry must hold its port.

`get_process_status "-"` already reports `stopped`. `cmd_list` shows `-` for the
uptime of a stopped app rather than a fictitious growing one.

## Testing

- `test/rive.bats` — `state_mark_stopped`, stale-cleaning preserves the
  sentinel, port stays allocated while stopped.
- `test/lifecycle_test.sh` — against a real repo and real processes: `stop`
  kills the process tree, the worktree survives, the state entry survives, the
  current app survives, the port is not reused, `add` and `restart` resume it,
  and `stop --all`.
