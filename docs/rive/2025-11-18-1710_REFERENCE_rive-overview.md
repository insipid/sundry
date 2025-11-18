# Rive CLI Tool - Overview

## What is Rive?

Rive is a lightweight CLI tool designed to simplify the management of ephemeral review applications in git repositories. It provides developers with an easy way to create, manage, and clean up temporary development environments tied to specific git branches.

## Key Features

- **Automatic Worktree Management**: Creates isolated git worktrees for each review app
- **Port Management**: Automatically allocates available ports to avoid conflicts
- **Simple Configuration**: Flexible configuration via environment variables, `.env` files, or CLI flags
- **Process Management**: Start, stop, restart, and monitor review app servers
- **Quick Navigation**: Built-in `cd` command to jump to review app directories

## Use Cases

### Parallel Feature Development
Work on multiple features simultaneously without switching branches or stopping your main development server.

### Code Review
Quickly spin up a review app from a pull request branch to test changes before merging.

### Bug Reproduction
Create isolated environments to reproduce and debug issues in specific branches.

### Demo Environments
Launch temporary demo environments for stakeholders without affecting your main development setup.

## Architecture

```
┌─────────────────────────────────────────┐
│           Rive CLI                      │
│  ┌──────────────────────────────────┐   │
│  │  Configuration Manager           │   │
│  │  (ENV, .env, CLI flags)         │   │
│  └──────────────────────────────────┘   │
│                │                         │
│  ┌─────────────┴─────────────┐         │
│  │                            │         │
│  ▼                            ▼         │
│  ┌──────────┐        ┌──────────────┐  │
│  │ Worktree │        │     Port     │  │
│  │ Manager  │        │   Manager    │  │
│  └──────────┘        └──────────────┘  │
│       │                      │          │
│       └──────────┬───────────┘          │
│                  ▼                       │
│         ┌─────────────────┐             │
│         │ Process Manager │             │
│         │  (start/stop)   │             │
│         └─────────────────┘             │
└─────────────────────────────────────────┘
```

## Quick Start

```bash
# Create a review app from a branch
rive create feature/new-ui

# List all running review apps
rive list

# Stop a review app
rive stop feature/new-ui

# Navigate to a review app's directory
rive cd feature/new-ui
```

## Related Documentation

- [User Guide](./2025-11-18-1710_REFERENCE_rive-user-guide.md) - Complete usage instructions
- [Technical Specification](./2025-11-18-1710_REFERENCE_rive-technical-spec.md) - Implementation details
- [Configuration Reference](./2025-11-18-1710_REFERENCE_rive-configuration.md) - All configuration options
- [Implementation Guide](./2025-11-18-1710_REFERENCE_rive-implementation.md) - Development guide

## Requirements

- Git (with worktree support)
- Bash/POSIX-compliant shell
- `lsof` or equivalent port checking utility
- Basic Unix utilities (`grep`, `awk`, `sed`)

## License

TBD

## Contributing

TBD
