# Rive CLI - Configuration Reference

## Configuration Overview

Rive supports three configuration methods with the following precedence:

1. **CLI flags** (highest priority)
2. **`.env` file** in current working directory
3. **Environment variables** (lowest priority)

## Configuration Variables

### RIVE_START_PORT

**Description:** The starting port number for automatic port allocation.

**Type:** Integer

**Default:** `40000`

**Valid Range:** `1024-65535` (avoid privileged ports below 1024)

**Examples:**
```bash
# Environment variable
export RIVE_START_PORT=3000

# .env file
RIVE_START_PORT=3000

# CLI flag
rive create --start-port 3000 feature/branch
```

**Notes:**
- Must be less than `RIVE_END_PORT`
- Commonly used ranges:
  - Development: 3000-3999
  - Testing: 8000-8999
  - Rive default: 40000-49999

---

### RIVE_END_PORT

**Description:** The ending port number for automatic port allocation.

**Type:** Integer

**Default:** `49999`

**Valid Range:** `1024-65535`

**Examples:**
```bash
# Environment variable
export RIVE_END_PORT=45000

# .env file
RIVE_END_PORT=45000

# CLI flag
rive create --end-port 45000 feature/branch
```

**Notes:**
- Must be greater than `RIVE_START_PORT`
- Larger ranges provide more capacity but slower port scanning
- Recommended range size: 100-1000 ports

---

### RIVE_WORKTREE_DIR

**Description:** Base directory where git worktrees will be created.

**Type:** Absolute path

**Default:** `~/.rive/worktrees`

**Examples:**
```bash
# Environment variable
export RIVE_WORKTREE_DIR=/tmp/rive-worktrees

# .env file
RIVE_WORKTREE_DIR=/var/tmp/rive-worktrees

# CLI flag
rive create --worktree-dir /custom/path feature/branch
```

**Notes:**
- Must be an absolute path
- Directory will be created if it doesn't exist
- User must have write permissions
- Consider using:
  - `/tmp` for automatic cleanup on reboot
  - SSD location for better performance
  - Project-specific subdirectories for organization

**Path Structure:**
```
$RIVE_WORKTREE_DIR/
├── feature-user-auth/     # Sanitized branch name
├── bugfix-login-error/
└── experiment-new-ui/
```

---

### RIVE_SERVER_COMMAND

**Description:** Command template to start the development server.

**Type:** String with `%PORT%` placeholder

**Default:** `npm run dev -- --port %PORT%`

**Examples:**

**Node.js with npm:**
```bash
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

**Node.js with yarn:**
```bash
RIVE_SERVER_COMMAND="yarn dev --port %PORT%"
```

**Node.js with pnpm:**
```bash
RIVE_SERVER_COMMAND="pnpm dev --port %PORT%"
```

**Python Django:**
```bash
RIVE_SERVER_COMMAND="python manage.py runserver 0.0.0.0:%PORT%"
```

**Python Flask:**
```bash
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

**Rust (with cargo):**
```bash
RIVE_SERVER_COMMAND="cargo run -- --port %PORT%"
```

**PHP (built-in server):**
```bash
RIVE_SERVER_COMMAND="php -S localhost:%PORT%"
```

**Vite:**
```bash
RIVE_SERVER_COMMAND="vite --port %PORT%"
```

**Next.js:**
```bash
RIVE_SERVER_COMMAND="next dev -p %PORT%"
```

**Notes:**
- The `%PORT%` placeholder is required and will be replaced with the allocated port
- Command is executed from the worktree directory
- Server should bind to `0.0.0.0` or `localhost`
- Use `--` to separate npm/yarn flags from script arguments

---

### RIVE_STATE_FILE

**Description:** Path to the state file that tracks running review apps.

**Type:** Absolute path

**Default:** `~/.rive/state.json`

**Examples:**
```bash
# Environment variable
export RIVE_STATE_FILE=/var/lib/rive/state.json

# .env file
RIVE_STATE_FILE=/custom/path/state.json
```

**Notes:**
- Must be an absolute path
- Directory must exist and be writable
- File will be created if it doesn't exist
- Use separate state files for different projects if needed

---

### RIVE_LOG_DIR

**Description:** Directory where server logs will be stored.

**Type:** Absolute path

**Default:** `~/.rive/logs`

**Examples:**
```bash
# Environment variable
export RIVE_LOG_DIR=/var/log/rive

# .env file
RIVE_LOG_DIR=/tmp/rive-logs
```

**Log File Structure:**
```
$RIVE_LOG_DIR/
├── feature-user-auth.log
├── feature-user-auth.err
├── bugfix-login-error.log
└── bugfix-login-error.err
```

**Notes:**
- Separate `.log` (stdout) and `.err` (stderr) files per review app
- Logs are appended, not rotated automatically
- Consider setting up log rotation for long-running apps

---

### RIVE_AUTO_INSTALL

**Description:** Automatically install dependencies when creating a review app.

**Type:** Boolean (`true` or `false`)

**Default:** `false`

**Examples:**
```bash
# Environment variable
export RIVE_AUTO_INSTALL=true

# .env file
RIVE_AUTO_INSTALL=true

# CLI flag
rive create --auto-install feature/branch
```

**Behavior:**
- When `true`, runs installation command after creating worktree
- Installation command is auto-detected:
  - `npm install` if `package-lock.json` exists
  - `yarn install` if `yarn.lock` exists
  - `pnpm install` if `pnpm-lock.yaml` exists
  - Custom command via `RIVE_INSTALL_COMMAND`

---

### RIVE_INSTALL_COMMAND

**Description:** Custom command to install dependencies.

**Type:** String

**Default:** Auto-detected (see `RIVE_AUTO_INSTALL`)

**Examples:**
```bash
# Environment variable
export RIVE_INSTALL_COMMAND="npm ci"

# .env file
RIVE_INSTALL_COMMAND="yarn install --frozen-lockfile"
```

**Notes:**
- Only used when `RIVE_AUTO_INSTALL=true`
- Executed from worktree directory
- Should be idempotent (safe to run multiple times)

---

### RIVE_AUTO_CLEANUP

**Description:** Automatically remove worktree when stopping a review app.

**Type:** Boolean (`true` or `false`)

**Default:** `false`

**Examples:**
```bash
# Environment variable
export RIVE_AUTO_CLEANUP=true

# .env file
RIVE_AUTO_CLEANUP=true

# CLI flag
rive stop --cleanup feature/branch
```

**Notes:**
- When `true`, `rive stop` removes the worktree
- When `false`, worktree is preserved for inspection
- Can be overridden per-command with `--cleanup` or `--no-cleanup`

---

### RIVE_TIMEOUT

**Description:** Timeout in seconds for server startup verification.

**Type:** Integer

**Default:** `30`

**Examples:**
```bash
# Environment variable
export RIVE_TIMEOUT=60

# .env file
RIVE_TIMEOUT=60
```

**Notes:**
- How long to wait for server to start before considering it failed
- Increase for slow-starting applications
- Decrease for faster feedback during development

---

### RIVE_HEALTH_CHECK_URL

**Description:** URL path to check server health after startup.

**Type:** String (URL path)

**Default:** `/` (root)

**Examples:**
```bash
# Environment variable
export RIVE_HEALTH_CHECK_URL=/health

# .env file
RIVE_HEALTH_CHECK_URL=/api/status
```

**Notes:**
- Used to verify server is responding after startup
- Should return HTTP 200 when server is healthy
- Full URL is `http://localhost:$PORT$RIVE_HEALTH_CHECK_URL`

---

### RIVE_GIT_FETCH

**Description:** Fetch latest changes from remote before creating worktree.

**Type:** Boolean (`true` or `false`)

**Default:** `true`

**Examples:**
```bash
# Environment variable
export RIVE_GIT_FETCH=false

# .env file
RIVE_GIT_FETCH=false
```

**Notes:**
- When `true`, runs `git fetch origin` before creating worktree
- Ensures review app uses latest branch version
- Disable for faster creation if you manage fetching manually

---

### RIVE_VERBOSE

**Description:** Enable verbose logging output.

**Type:** Boolean (`true` or `false`)

**Default:** `false`

**Examples:**
```bash
# Environment variable
export RIVE_VERBOSE=true

# .env file
RIVE_VERBOSE=true

# CLI flag
rive --verbose create feature/branch
```

**Output Example:**
```
[DEBUG] Loading configuration from .env
[DEBUG] RIVE_START_PORT=40000
[DEBUG] RIVE_WORKTREE_DIR=/tmp/rive-worktrees
[INFO] Validating branch: feature/user-auth
[DEBUG] Branch exists: feature/user-auth
[INFO] Finding available port...
[DEBUG] Checking port 40000... in use
[DEBUG] Checking port 40001... available
[INFO] Creating worktree at /tmp/rive-worktrees/feature-user-auth
[DEBUG] Running: git worktree add ...
[INFO] Starting server on port 40001
[DEBUG] Running: npm run dev -- --port 40001
[INFO] Review app created successfully
```

---

## Configuration File Examples

### Basic Configuration

```bash
# .env
RIVE_START_PORT=40000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
```

### Advanced Configuration

```bash
# .env
# Port configuration
RIVE_START_PORT=40000
RIVE_END_PORT=40099

# Paths
RIVE_WORKTREE_DIR=/var/tmp/rive-worktrees
RIVE_STATE_FILE=/var/lib/rive/state.json
RIVE_LOG_DIR=/var/log/rive

# Server configuration
RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%"
RIVE_TIMEOUT=60
RIVE_HEALTH_CHECK_URL=/health

# Automation
RIVE_AUTO_INSTALL=true
RIVE_INSTALL_COMMAND="npm ci"
RIVE_AUTO_CLEANUP=false
RIVE_GIT_FETCH=true

# Debugging
RIVE_VERBOSE=false
```

### Project-Specific Configuration

**Frontend (React/Vite):**
```bash
# .env
RIVE_START_PORT=3000
RIVE_SERVER_COMMAND="vite --port %PORT% --host 0.0.0.0"
RIVE_AUTO_INSTALL=true
RIVE_TIMEOUT=45
```

**Backend (Python Django):**
```bash
# .env
RIVE_START_PORT=8000
RIVE_SERVER_COMMAND="python manage.py runserver 0.0.0.0:%PORT%"
RIVE_AUTO_INSTALL=true
RIVE_INSTALL_COMMAND="pip install -r requirements.txt"
RIVE_HEALTH_CHECK_URL=/api/health
```

**Monorepo:**
```bash
# .env
RIVE_START_PORT=4000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees/my-monorepo
RIVE_SERVER_COMMAND="pnpm --filter @myapp/frontend dev --port %PORT%"
RIVE_AUTO_INSTALL=true
RIVE_INSTALL_COMMAND="pnpm install"
```

## Environment-Specific Configurations

### Development

```bash
# .env.development
RIVE_START_PORT=3000
RIVE_WORKTREE_DIR=/tmp/rive-worktrees
RIVE_AUTO_CLEANUP=false  # Keep worktrees for debugging
RIVE_VERBOSE=true        # Show detailed logs
```

### CI/CD

```bash
# .env.ci
RIVE_START_PORT=40000
RIVE_WORKTREE_DIR=/tmp/ci-rive-worktrees
RIVE_AUTO_CLEANUP=true   # Clean up after tests
RIVE_TIMEOUT=120         # Longer timeout for slow CI
RIVE_VERBOSE=true        # Capture detailed logs
```

### Production (Self-Hosted)

```bash
# .env.production
RIVE_START_PORT=8000
RIVE_WORKTREE_DIR=/var/lib/rive/worktrees
RIVE_STATE_FILE=/var/lib/rive/state.json
RIVE_LOG_DIR=/var/log/rive
RIVE_AUTO_CLEANUP=false
RIVE_GIT_FETCH=true
RIVE_VERBOSE=false
```

## Configuration Validation

Rive validates configuration on startup:

```bash
# Valid configuration
✓ RIVE_START_PORT is numeric and in valid range
✓ RIVE_END_PORT is greater than RIVE_START_PORT
✓ RIVE_WORKTREE_DIR is absolute path
✓ RIVE_SERVER_COMMAND contains %PORT% placeholder
✓ RIVE_STATE_FILE directory is writable

# Invalid configuration
✗ Error: RIVE_START_PORT must be between 1024 and 65535
✗ Error: RIVE_WORKTREE_DIR must be an absolute path
✗ Error: RIVE_SERVER_COMMAND must contain %PORT% placeholder
```

## Troubleshooting Configuration

### Check Current Configuration

```bash
# Show resolved configuration
rive config show

# Output:
# Configuration (resolved):
# RIVE_START_PORT=40000 (from .env)
# RIVE_END_PORT=49999 (default)
# RIVE_WORKTREE_DIR=/tmp/rive-worktrees (from environment)
# RIVE_SERVER_COMMAND="npm run dev -- --port %PORT%" (from .env)
```

### Validate Configuration

```bash
# Validate without creating review app
rive config validate

# Output:
# ✓ Configuration is valid
# ✓ All required values are set
# ✓ All paths are accessible
# ✓ Port range is valid
```

### Debug Configuration Loading

```bash
# Show configuration loading order
rive --verbose config show

# Output:
# [DEBUG] Loading environment variables
# [DEBUG] Loading .env from /path/to/project/.env
# [DEBUG] Applying CLI flags
# [DEBUG] Final configuration:
# ...
```

## Best Practices

1. **Use `.env` files** for project-specific defaults
2. **Use environment variables** for machine-specific overrides
3. **Use CLI flags** for one-off changes
4. **Commit `.env.example`** to version control (not `.env`)
5. **Document custom configurations** in project README
6. **Validate configurations** in CI/CD pipelines
7. **Use absolute paths** for all directory configurations
8. **Test configurations** before deploying to production
