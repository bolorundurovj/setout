"""Migration helpers for the Makefile.

The built-in `tortoise downgrade` rolls back to a named migration, keeping it.
To roll back exactly one step, target the second to last migration. With a
single migration, roll it back with no target.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys

from tortoise import Tortoise
from tortoise.migrations.recorder import MigrationRecorder

from setout.db import close_db, init_db

APP_LABEL = "models"


async def applied_names() -> list[str]:
    await init_db()
    try:
        recorder = MigrationRecorder(Tortoise.get_connection("default"))
        return [
            key.name for key in await recorder.applied_migrations() if key.app_label == APP_LABEL
        ]
    finally:
        await close_db()


def downgrade_one() -> int:
    names = asyncio.run(applied_names())
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
