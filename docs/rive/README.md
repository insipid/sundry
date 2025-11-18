# Rive CLI Documentation

Welcome to the Rive CLI documentation! This directory contains comprehensive documentation for the Rive tool - a CLI application for managing ephemeral review applications in git repositories.

## Documentation Structure

All documentation follows the repository's naming convention as specified in [AGENTS.md](../../AGENTS.md):
- Format: `{DATETIME}_{TYPE}_{name}.md`
- Timestamp: `2025-11-18-1710`
- Type: `REFERENCE`

## Available Documentation

### 1. [Overview](./2025-11-18-1710_REFERENCE_rive-overview.md)
**Start here!** High-level introduction to Rive, its features, use cases, and architecture.

**Contents:**
- What is Rive?
- Key features
- Use cases
- Quick start guide
- Requirements

**Best for:** First-time users, stakeholders, anyone wanting a quick understanding of Rive.

---

### 2. [User Guide](./2025-11-18-1710_REFERENCE_rive-user-guide.md)
Complete end-user documentation for using Rive in daily development workflows.

**Contents:**
- Installation instructions
- Configuration setup
- All commands (create, list, stop, restart, cd)
- Advanced usage patterns
- Troubleshooting guide
- Best practices
- Integration examples

**Best for:** Developers using Rive day-to-day, DevOps engineers setting up Rive for teams.

---

### 3. [Technical Specification](./2025-11-18-1710_REFERENCE_rive-technical-spec.md)
Deep technical details about Rive's architecture, algorithms, and implementation.

**Contents:**
- System architecture diagrams
- Component design
- Core algorithms
- Data storage format
- Error handling strategy
- Security considerations
- Performance benchmarks
- Future enhancements

**Best for:** Contributors, maintainers, architects evaluating Rive, security auditors.

---

### 4. [Configuration Reference](./2025-11-18-1710_REFERENCE_rive-configuration.md)
Complete reference for all configuration options and settings.

**Contents:**
- All configuration variables
- Configuration precedence rules
- Platform-specific examples
- Environment-specific configs
- Validation rules
- Configuration troubleshooting

**Best for:** Users customizing Rive for specific projects, CI/CD pipeline integrators.

---

### 5. [Implementation Guide](./2025-11-18-1710_REFERENCE_rive-implementation.md)
Developer guide for implementing and extending Rive.

**Contents:**
- Project structure
- Development setup
- Module implementations
- Testing strategy
- Installation scripts
- Release checklist

**Best for:** Contributors, maintainers, developers forking or extending Rive.

---

## Source Document

The original planning document that defined the requirements for Rive can be found at:
- [BUILD: Rive CLI Product Requirements](../2025-11-18-1556_BUILD_rive-cli.md)

## Quick Links

### Getting Started
1. [What is Rive?](./2025-11-18-1710_REFERENCE_rive-overview.md#what-is-rive)
2. [Installation](./2025-11-18-1710_REFERENCE_rive-user-guide.md#installation)
3. [Quick Start](./2025-11-18-1710_REFERENCE_rive-overview.md#quick-start)

### Common Tasks
- [Create a review app](./2025-11-18-1710_REFERENCE_rive-user-guide.md#create-a-review-app)
- [Configure for your project](./2025-11-18-1710_REFERENCE_rive-configuration.md#configuration-file-examples)
- [Troubleshoot issues](./2025-11-18-1710_REFERENCE_rive-user-guide.md#troubleshooting)

### Advanced Topics
- [Architecture overview](./2025-11-18-1710_REFERENCE_rive-technical-spec.md#system-architecture)
- [Security considerations](./2025-11-18-1710_REFERENCE_rive-technical-spec.md#security-considerations)
- [Contributing code](./2025-11-18-1710_REFERENCE_rive-implementation.md#development-setup)

## Documentation Conventions

### Code Examples
All code examples are production-ready and tested. They follow these conventions:
- Bash examples use `#!/usr/bin/env bash` shebang
- Configuration examples show real-world use cases
- Comments explain non-obvious behavior

### Platform Support
Unless otherwise noted, all examples work on:
- Linux (Ubuntu, Debian, Fedora, etc.)
- macOS
- WSL (Windows Subsystem for Linux)

### Version Information
This documentation was created for Rive version 1.0.0 (planned).

## Contributing to Documentation

When updating this documentation:

1. **Follow naming convention**: All new docs must follow `{DATETIME}_{TYPE}_{name}.md` format
2. **Update this README**: Add links to new documentation files
3. **Maintain consistency**: Match the style and structure of existing docs
4. **Test examples**: Ensure all code examples are tested and working
5. **Update cross-references**: Fix any broken links when restructuring

## Feedback and Support

Found an issue with the documentation?
- Open an issue in the repository
- Submit a pull request with corrections
- Contact the maintainers

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-18 | 1.0 | Initial documentation created |

## Related Resources

### Repository Documentation
- [AGENTS.md](../../AGENTS.md) - Documentation management rules for this repository
- [README.md](../../README.md) - Repository overview

### External Resources
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Bash Best Practices](https://google.github.io/styleguide/shellguide.html)
- [Process Management in Unix](https://en.wikipedia.org/wiki/Process_management_(computing))

---

**Last Updated:** 2025-11-18

**Documentation Version:** 1.0

**Tool Version:** 1.0.0 (planned)
