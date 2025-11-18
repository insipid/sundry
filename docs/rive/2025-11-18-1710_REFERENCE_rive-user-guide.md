# Rive CLI - User Guide

## Installation

### Prerequisites

Before installing Rive, ensure you have:

- Git 2.5+ (with worktree support)
- Bash 4.0+
- `lsof` command (for port checking)
- Your project's development server (e.g., npm, Python, etc.)

### Install Script

```bash
# Clone or download rive
curl -o /usr/local/bin/rive https://raw.githubusercontent.com/example/rive/main/rive
chmod +x /usr/local/bin/rive

# Verify installation
rive --version
```

## Configuration

### Configuration Precedence

Rive uses the following configuration precedence (highest to lowest):

1. **CLI flags** (highest priority)
2. **`.env` file** in current working directory
3. **Environment variables** (lowest priority)

### Configuration File

Create a `.env` file in your project root:

```bash
# .env
RIVE_START_PORT=40000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

### Environment Variables

Export variables in your shell:

```bash
export RIVE_START_PORT=40000
export RIVE_WORKTREE_DIR=/tmp/rive-worktrees
export RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

## Commands

### Create a Review App

Create a new review app from a git branch:

```bash
rive create <branch-name>
```

**Example:**
```bash
# Create review app for feature branch
rive create feature/user-authentication

# With custom port
rive create --port 3001 feature/user-authentication

# With custom worktree directory
rive create --worktree-dir /custom/path feature/user-authentication
```

**What happens:**
1. Validates branch exists
2. Creates a git worktree for the branch
3. Finds an available port (starting from `RIVE_START_PORT`)
4. Launches the development server
5. Stores process information for management

### List Review Apps

Display all running review apps:

```bash
rive list
```

**Output example:**
```
BRANCH                      PORT    WORKTREE                    STATUS    UPTIME
feature/user-auth          40000   /tmp/rive/user-auth         Running   2h 15m
bugfix/login-error         40001   /tmp/rive/login-error       Running   45m
feature/new-dashboard      40002   /tmp/rive/new-dashboard     Running   1h 30m
```

**Column descriptions:**
- **BRANCH**: Git branch name
- **PORT**: Port number where the server is running
- **WORKTREE**: Path to the git worktree
- **STATUS**: Server process status (Running, Stopped, Error)
- **UPTIME**: How long the server has been running

### Stop a Review App

Stop a running review app:

```bash
rive stop <branch-name or port>
```

**Examples:**
```bash
# Stop by branch name
rive stop feature/user-authentication

# Stop by port number
rive stop 40000

# Stop all review apps
rive stop --all
```

**What happens:**
1. Terminates the server process
2. Optionally removes the worktree
3. Cleans up process tracking data

### Restart a Review App

Restart an existing review app:

```bash
rive restart <branch-name or port>
```

**Examples:**
```bash
# Restart by branch name
rive restart feature/user-authentication

# Restart by port number
rive restart 40000
```

**What happens:**
1. Stops the current server process
2. Pulls latest changes from remote (optional)
3. Starts the server on the same port
4. Maintains the same worktree

### Navigate to Review App Directory

Change your shell's current directory to a review app's worktree:

```bash
rive cd <branch-name or port>
```

**Examples:**
```bash
# Navigate by branch name
rive cd feature/user-authentication

# Navigate by port number
rive cd 40000
```

**Note:** This command outputs a path that can be used with shell's `cd` command. You may need to use it like:
```bash
cd $(rive cd feature/user-authentication)
```

Or create a shell function:
```bash
# Add to ~/.bashrc or ~/.zshrc
rivecd() {
    cd $(rive cd "$1")
}

# Usage
rivecd feature/user-authentication
```

## Advanced Usage

### Custom Server Commands

Configure different server commands for different projects:

```bash
# Node.js with npm
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"

# Node.js with yarn
RIVE_SERVER_COMMAND="yarn dev --port %PORT%"

# Python Django
RIVE_SERVER_COMMAND="python manage.py runserver 0.0.0.0:%PORT%"

# Python Flask
RIVE_SERVER_COMMAND="FLASK_RUN_PORT=%PORT% flask run"

# Ruby on Rails
RIVE_SERVER_COMMAND="rails server -p %PORT%"

# Go
RIVE_SERVER_COMMAND="PORT=%PORT% go run main.go"
```

### Port Range Configuration

Limit the port range Rive can use:

```bash
# .env
RIVE_START_PORT=40000
RIVE_END_PORT=40099
```

This ensures Rive only uses ports 40000-40099.

### Custom Worktree Locations

Organize worktrees by project:

```bash
# Per-project configuration
RIVE_WORKTREE_DIR="$HOME/.rive/$(basename $(pwd))"
```

## Troubleshooting

### Port Already in Use

**Error:** `Error: Port 40000 is already in use`

**Solution:**
1. Check if another process is using the port: `lsof -i :40000`
2. Use a different starting port: `rive create --port 40001 branch-name`
3. Stop the conflicting process

### Branch Not Found

**Error:** `Error: Branch 'feature/xyz' not found`

**Solution:**
1. Fetch latest branches: `git fetch --all`
2. Verify branch name: `git branch -a | grep xyz`
3. Ensure branch exists remotely or locally

### Server Won't Start

**Error:** `Error: Server failed to start`

**Solution:**
1. Check server command configuration
2. Verify dependencies are installed in worktree
3. Check server logs in worktree directory
4. Ensure port is actually available

### Worktree Creation Failed

**Error:** `Error: Failed to create worktree`

**Solution:**
1. Ensure worktree directory is writable
2. Check disk space availability
3. Verify git repository is clean (no uncommitted changes blocking)

## Best Practices

### Naming Conventions

Use consistent branch naming for easier management:
```bash
feature/feature-name
bugfix/bug-description
hotfix/urgent-fix
experiment/test-idea
```

### Resource Cleanup

Regularly clean up stopped review apps:
```bash
# Stop all inactive review apps
rive list | grep Stopped | awk '{print $1}' | xargs -I {} rive stop --cleanup {}
```

### Configuration Management

Keep project-specific `.env` files in version control (without secrets):
```bash
# .env.example
RIVE_START_PORT=40000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

### Performance Tips

1. Use SSDs for worktree directories (faster checkout)
2. Configure smaller port ranges to speed up port scanning
3. Set `RIVE_WORKTREE_DIR` to `/tmp` or `/var/tmp` for automatic cleanup

## Integration with Other Tools

### Git Hooks

Automatically clean up review apps when deleting branches:

```bash
# .git/hooks/post-branch-delete
#!/bin/bash
rive stop "$1" --cleanup
```

### IDE Integration

Configure your IDE to recognize rive worktrees:

**VSCode:**
```json
{
  "files.watcherExclude": {
    "**/rive-worktrees/**": true
  }
}
```

### CI/CD Integration

Use rive for preview deployments:

```yaml
# .github/workflows/preview.yml
name: Preview Deployment
on: pull_request
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Create review app
        run: |
          rive create ${{ github.head_ref }}
          echo "Preview URL: http://localhost:$(rive list | grep ${{ github.head_ref }} | awk '{print $2}')"
```

## FAQ

**Q: Can I run multiple review apps from the same branch?**
A: Not currently. Each branch can only have one active review app.

**Q: Does rive work with submodules?**
A: Yes, git worktree supports submodules. They will be initialized in the worktree.

**Q: Can I use rive with a monorepo?**
A: Yes, but you'll need to configure `RIVE_SERVER_COMMAND` to start the correct service.

**Q: What happens if my machine restarts?**
A: Review apps won't auto-restart. You'll need to manually restart them or clean them up.

**Q: Can I share review apps across my network?**
A: Yes, configure your server to bind to `0.0.0.0` instead of `localhost`, but ensure proper security measures.
