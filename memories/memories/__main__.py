"""Allow `python -m memories` invocation."""
import sys
from .cli import main

main(sys.argv[1:])
