"""Unit tests for the setout CLI helpers and argument parsing."""

from __future__ import annotations

from pathlib import Path

import pytest

from setout import cli

pytestmark = pytest.mark.unit


def test_generate_passphrase_generates_sufficiently_long_string() -> None:
    pw1 = cli.generate_passphrase(20)
    pw2 = cli.generate_passphrase(20)
    assert len(pw1) >= 20
    assert len(pw2) >= 20
    assert pw1 != pw2


def test_build_parser_options() -> None:
    parser = cli.build_parser()

    args = parser.parse_args(["reset-passphrase", "--file", "secret.txt", "--user", "Alice"])
    assert args.command == "reset-passphrase"
    assert args.file_path == "secret.txt"
    assert args.username == "Alice"
    assert args.generate is False
    assert args.use_stdin is False

    args_gen = parser.parse_args(["reset-passphrase", "-g", "--stdin"])
    assert args_gen.generate is True
    assert args_gen.use_stdin is True


def test_read_recovery_file_simple(tmp_path: Path) -> None:
    rec_file = tmp_path / "reset-passphrase.txt"
    rec_file.write_text("my-new-passphrase-123\n", encoding="utf-8")

    creds = cli.read_recovery_file(rec_file)
    assert creds == (None, "my-new-passphrase-123")


def test_read_recovery_file_with_user_and_comments(tmp_path: Path) -> None:
    rec_file = tmp_path / "reset-passphrase.txt"
    rec_file.write_text(
        "# Reset recovery file\n\nAdminUser:another-secret-passphrase\n",
        encoding="utf-8",
    )

    creds = cli.read_recovery_file(rec_file)
    assert creds == ("AdminUser", "another-secret-passphrase")


def test_read_recovery_file_empty(tmp_path: Path) -> None:
    rec_file = tmp_path / "reset-passphrase.txt"
    rec_file.write_text("# Only comments\n\n", encoding="utf-8")

    assert cli.read_recovery_file(rec_file) is None


def test_find_recovery_file_custom(tmp_path: Path) -> None:
    custom = tmp_path / "custom-pass.txt"
    custom.write_text("pass", encoding="utf-8")

    found = cli.find_recovery_file(custom)
    assert found == custom.resolve()
    assert cli.find_recovery_file(tmp_path / "does-not-exist.txt") is None


async def test_reset_passphrase_too_short() -> None:
    code = await cli.reset_passphrase(passphrase="short")
    assert code == 1


async def test_reset_passphrase_interactive_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts = ["first-passphrase", "second-passphrase"]

    def fake_getpass(prompt: str) -> str:
        return prompts.pop(0)

    monkeypatch.setattr(cli.getpass, "getpass", fake_getpass)
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)

    code = await cli.reset_passphrase()
    assert code == 1


def test_main_calls_reset_passphrase(monkeypatch: pytest.MonkeyPatch) -> None:
    called_with: dict[str, object] = {}

    async def fake_reset(
        *,
        file_path: str | Path | None = None,
        username: str | None = None,
        passphrase: str | None = None,
        generate: bool = False,
        use_stdin: bool = False,
    ) -> int:
        called_with.update(
            {
                "file_path": file_path,
                "username": username,
                "passphrase": passphrase,
                "generate": generate,
                "use_stdin": use_stdin,
            }
        )
        return 0

    monkeypatch.setattr(cli, "reset_passphrase", fake_reset)
    exit_code = cli.main(["reset-passphrase", "--file", "secret.txt", "--user", "Admin"])
    assert exit_code == 0
    assert called_with == {
        "file_path": "secret.txt",
        "username": "Admin",
        "passphrase": None,
        "generate": False,
        "use_stdin": False,
    }
