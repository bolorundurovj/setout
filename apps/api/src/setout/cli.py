"""Setout command-line interface."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import secrets
import sys
from pathlib import Path

from tortoise import Tortoise

from setout.config import get_settings
from setout.db import close_db, init_db
from setout.models.user import Session, User
from setout.services.auth import hash_password

logger = logging.getLogger("setout.cli")

MIN_PASSPHRASE_LENGTH = 8
RECOVERY_FILE_NAME = "reset-passphrase.txt"


def generate_passphrase(length: int = 20) -> str:
    """Generate a random secure passphrase."""
    return secrets.token_urlsafe(length)


def find_recovery_file(custom_path: str | Path | None = None) -> Path | None:
    """Find a recovery file if one exists."""
    if custom_path:
        p = Path(custom_path).resolve()
        return p if p.is_file() else None

    cwd_file = Path.cwd() / RECOVERY_FILE_NAME
    if cwd_file.is_file():
        return cwd_file

    try:
        data_dir = get_settings().data_dir
        data_file = Path(data_dir) / RECOVERY_FILE_NAME
        if data_file.is_file():
            return data_file
    except Exception:  # noqa: BLE001
        pass

    root_file = Path(__file__).resolve().parents[3] / RECOVERY_FILE_NAME
    if root_file.is_file():
        return root_file

    return None


def read_recovery_file(file_path: Path) -> tuple[str | None, str] | None:
    """Read credentials from a recovery file.

    Expected format: either a single line with the new passphrase,
    or username:new-passphrase. Lines starting with # are ignored.
    """
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.error("Could not read recovery file %s: %s", file_path, exc)
        return None

    lines = [
        line.strip()
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if not lines:
        logger.error("Recovery file %s is empty", file_path)
        return None

    first = lines[0]
    if ":" in first:
        user_part, pass_part = first.split(":", 1)
        return (user_part.strip() or None, pass_part.strip())
    return (None, first)


async def apply_passphrase_reset(user: User, new_passphrase: str) -> None:
    """Apply new passphrase, clear failed attempts, and revoke active sessions."""
    user.password_hash = hash_password(new_passphrase)
    user.failed_logins = 0
    user.last_failed_at = None
    await user.save()

    # Invalidate all active sessions so any compromised devices are signed out.
    await Session.filter(user_id=user.id).delete()


async def consume_recovery_file(custom_path: str | Path | None = None) -> bool:
    """Check for, apply, and delete a recovery file if one exists.

    Returns True if a recovery file was found and successfully applied.
    """
    file_path = find_recovery_file(custom_path)
    if not file_path:
        return False

    creds = read_recovery_file(file_path)
    if not creds:
        return False

    username, new_passphrase = creds
    if len(new_passphrase) < MIN_PASSPHRASE_LENGTH:
        logger.error(
            "Passphrase in recovery file %s is shorter than %d characters",
            file_path,
            MIN_PASSPHRASE_LENGTH,
        )
        return False

    manage_db = not getattr(Tortoise, "_inited", False)
    if manage_db:
        await init_db()
    try:
        user = await User.get_or_none(name=username) if username else await User.first()
        if not user:
            logger.error("No user found to reset via recovery file %s", file_path)
            return False

        await apply_passphrase_reset(user, new_passphrase)
        logger.warning("Admin passphrase reset for '%s' via %s", user.name, file_path)
        try:
            file_path.unlink()
            logger.info("Deleted recovery file %s", file_path)
        except OSError as exc:
            logger.warning("Could not delete recovery file %s: %s", file_path, exc)
        return True
    finally:
        if manage_db:
            await close_db()


async def reset_passphrase(
    *,
    file_path: str | Path | None = None,
    username: str | None = None,
    passphrase: str | None = None,
    generate: bool = False,
    use_stdin: bool = False,
) -> int:
    """Reset the passphrase for an admin user."""
    target_file = find_recovery_file(file_path)
    if target_file and not passphrase and not generate and not use_stdin:
        creds = read_recovery_file(target_file)
        if not creds:
            print(f"Error: Could not read valid passphrase from '{target_file}'.", file=sys.stderr)
            return 1
        file_user, new_passphrase = creds
        if not username and file_user:
            username = file_user
    elif generate:
        new_passphrase = generate_passphrase()
    elif passphrase is not None:
        new_passphrase = passphrase
    elif use_stdin or not sys.stdin.isatty():
        new_passphrase = sys.stdin.readline().strip()
    else:
        try:
            first_entry = getpass.getpass("Enter new passphrase: ")
            confirm_entry = getpass.getpass("Confirm new passphrase: ")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.", file=sys.stderr)
            return 1

        if first_entry != confirm_entry:
            print("Error: Passphrases do not match.", file=sys.stderr)
            return 1
        new_passphrase = first_entry

    if len(new_passphrase) < MIN_PASSPHRASE_LENGTH:
        print(
            f"Error: Passphrase must be at least {MIN_PASSPHRASE_LENGTH} characters long.",
            file=sys.stderr,
        )
        return 1

    manage_db = not getattr(Tortoise, "_inited", False)
    if manage_db:
        await init_db()
    try:
        user = await User.get_or_none(name=username) if username else await User.first()
        if not user:
            target = f"user '{username}'" if username else "admin user"
            print(f"Error: No {target} found in the database.", file=sys.stderr)
            return 1

        await apply_passphrase_reset(user, new_passphrase)

        if target_file and target_file.is_file():
            try:
                target_file.unlink()
                print(f"Consumed and removed recovery file '{target_file}'.")
            except OSError as exc:
                print(
                    f"Warning: Could not remove recovery file '{target_file}': {exc}",
                    file=sys.stderr,
                )

        print(f"Passphrase successfully reset for '{user.name}'.")
        if generate:
            print(f"Generated passphrase: {new_passphrase}")
        return 0
    finally:
        if manage_db:
            await close_db()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="setout",
        description="Setout administrative CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    reset_parser = subparsers.add_parser(
        "reset-passphrase",
        help="Reset the admin passphrase.",
        description="Reset the passphrase for an admin user account.",
    )
    reset_parser.add_argument(
        "-f",
        "--file",
        dest="file_path",
        help="Path to the recovery file containing the new passphrase."
        " If not specified, checks for 'reset-passphrase.txt'.",
    )
    reset_parser.add_argument(
        "-u",
        "--user",
        dest="username",
        help="Account username to reset. Defaults to the first user found.",
    )
    reset_parser.add_argument(
        "-g",
        "--generate",
        action="store_true",
        help="Generate a random secure passphrase automatically and print it.",
    )
    reset_parser.add_argument(
        "--stdin",
        dest="use_stdin",
        action="store_true",
        help="Read the new passphrase from standard input.",
    )
    reset_parser.add_argument(
        "-p",
        "--passphrase",
        help=argparse.SUPPRESS,
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "reset-passphrase":
        return asyncio.run(
            reset_passphrase(
                file_path=args.file_path,
                username=args.username,
                passphrase=args.passphrase,
                generate=args.generate,
                use_stdin=args.use_stdin,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
