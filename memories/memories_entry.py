#!/usr/bin/env python3
"""Entry point shim — delegates to memories.cli.main."""
import sys
from memories.cli import main

if __name__ == "__main__":
    main(sys.argv[1:])
