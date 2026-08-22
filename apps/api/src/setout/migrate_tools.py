"""Migration helpers for the Makefile.

The built-in `tortoise downgrade` rolls back to a named migration, keeping it.
To roll back exactly one step, target the second to last migration. With a
single migration, roll it back with no target.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

APP_LABEL = "models"
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def migration_names() -> list[str]:
    """Return migration file stems in order, for example 0001_initial."""
    names = [p.stem for p in MIGRATIONS_DIR.glob("[0-9]*.py")]
    return sorted(names)


def downgrade_one() -> int:
    names = migration_names()
    if not names:
        print("No migrations to roll back.")
        return 0

    cmd = [sys.executable, "-m", "tortoise", "downgrade", APP_LABEL]
    if len(names) >= 2:
        # Keep the previous migration, roll back only the latest.
        cmd.append(names[-2])
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(downgrade_one())
