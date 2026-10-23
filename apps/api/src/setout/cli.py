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
from setout.services.auth import hash_passphrase

logger = logging.getLogger("setout.cli")

MIN_PASSPHRASE_LENGTH = 8
RECOVERY_FILE_NAME = "reset-passphrase.txt"


def generate_passphrase(length: int = 20) -> str:
    return secrets.token_urlsafe(length)


def find_recovery_file(custom_path: str | Path | None = None) -> Path | None:
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
    """Format: the new passphrase, or account name:passphrase. Lines starting with # are ignored."""
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
    user.passphrase_hash = hash_passphrase(new_passphrase)
    user.failed_sign_ins = 0
    user.last_failed_at = None
    await user.save()

    # Ends every session so that compromised devices are signed out.
    await Session.filter(user_id=user.id).delete()


async def consume_recovery_file(custom_path: str | Path | None = None) -> bool:
    """Returns True only when a recovery file was found and applied."""
    file_path = find_recovery_file(custom_path)
    if not file_path:
        return False

    creds = read_recovery_file(file_path)
    if not creds:
        return False

    account_name, new_passphrase = creds
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
        user = await User.get_or_none(name=account_name) if account_name else await User.first()
        if not user:
            logger.error("No account found to reset via recovery file %s", file_path)
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
    account_name: str | None = None,
    passphrase: str | None = None,
    generate: bool = False,
    use_stdin: bool = False,
) -> int:
    target_file = find_recovery_file(file_path)
    if target_file and not passphrase and not generate and not use_stdin:
        creds = read_recovery_file(target_file)
        if not creds:
            print(
                f"Error: Could not read a valid passphrase from '{target_file}'.", file=sys.stderr
            )
            return 1
        file_user, new_passphrase = creds
        if not account_name and file_user:
            account_name = file_user
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
        user = await User.get_or_none(name=account_name) if account_name else await User.first()
        if not user:
            target = f"account '{account_name}'" if account_name else "admin account"
            print(f"Error: No {target} found in the database.", file=sys.stderr)
            return 1

        await apply_passphrase_reset(user, new_passphrase)

        if target_file and target_file.is_file():
            try:
                target_file.unlink()
                print(f"Deleted recovery file '{target_file}'.")
            except OSError as exc:
                print(
                    f"Warning: Could not delete recovery file '{target_file}': {exc}",
                    file=sys.stderr,
                )

        print(f"Passphrase reset for '{user.name}'.")
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
        description="Reset the passphrase for an admin account.",
    )
    reset_parser.add_argument(
        "-f",
        "--file",
        dest="file_path",
        help="Path to the recovery file containing the new passphrase."
        " If omitted, searches for 'reset-passphrase.txt'.",
    )
    reset_parser.add_argument(
        "-n",
        "--name",
        "-u",
        "--user",
        dest="account_name",
        help="Account name to reset. Defaults to the first account found.",
    )
    reset_parser.add_argument(
        "-g",
        "--generate",
        action="store_true",
        help="Generate a random passphrase and print it.",
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
                account_name=args.account_name,
                passphrase=args.passphrase,
                generate=args.generate,
                use_stdin=args.use_stdin,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
