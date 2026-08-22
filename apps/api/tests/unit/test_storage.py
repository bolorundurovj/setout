"""The storage interface and the two backends behind it."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from setout.config import Settings
from setout.services.storage import build_storage, checksum_of, key_for
from setout.services.storage.local import LocalStorage
from setout.services.storage.s3 import S3Storage

pytestmark = pytest.mark.unit


def test_the_name_of_a_file_is_the_hash_of_what_is_inside_it() -> None:
    key = key_for(checksum_of(b"a receipt"), "receipt_16aug.jpg")

    assert key.endswith(".jpg")
    # Two levels of fan-out, so no one directory holds everything.
    head, second, name = key.split("/")
    assert name.startswith(head + second)
    assert len(name.split(".")[0]) == 64


def test_the_same_contents_under_a_different_name_is_the_same_file() -> None:
    first = key_for(checksum_of(b"same photo"), "one.jpg")
    second = key_for(checksum_of(b"same photo"), "two.jpg")

    assert first == second


@pytest.mark.parametrize(
    ("filename", "ending"),
    [
        ("receipt.jpg", ".jpg"),
        ("RECEIPT.JPG", ".jpg"),
        ("no extension at all", ""),
        ("../../etc/passwd", ""),
        ("odd.name with spaces", ""),
    ],
)
def test_only_a_plain_ending_is_carried_into_the_key(filename: str, ending: str) -> None:
    key = key_for(checksum_of(b"x"), filename)

    # The key is two directories and the hash, plus an ending only where that
    # ending is a plain one.
    assert key.count("/") == 2
    assert key.rsplit("/", 1)[-1] == checksum_of(b"x") + ending


class TestLocalStorage:
    async def test_a_file_written_comes_back_whole(self, tmp_path: Path) -> None:
        store = LocalStorage(tmp_path)
        key = key_for(checksum_of(b"a receipt"), "receipt.jpg")

        await store.put(key, b"a receipt", content_type="image/jpeg")

        assert await store.exists(key) is True
        assert await store.get(key) == b"a receipt"

    async def test_it_leaves_nothing_half_written_behind(self, tmp_path: Path) -> None:
        store = LocalStorage(tmp_path)
        key = key_for(checksum_of(b"a receipt"), "receipt.jpg")

        await store.put(key, b"a receipt", content_type="image/jpeg")

        assert list(tmp_path.rglob("*.part")) == []

    async def test_a_file_that_is_not_there_says_so_rather_than_answering_nothing(
        self, tmp_path: Path
    ) -> None:
        store = LocalStorage(tmp_path)

        assert await store.exists("ab/cd/nothing.jpg") is False
        with pytest.raises(FileNotFoundError):
            await store.get("ab/cd/nothing.jpg")

    async def test_taking_away_a_file_that_is_already_gone_is_not_an_error(
        self, tmp_path: Path
    ) -> None:
        store = LocalStorage(tmp_path)

        await store.delete("ab/cd/nothing.jpg")

    async def test_a_key_cannot_climb_out_of_the_store(self, tmp_path: Path) -> None:
        store = LocalStorage(tmp_path / "attachments")

        with pytest.raises(ValueError):
            await store.get("../../../etc/passwd")

    async def test_it_hands_out_no_link_of_its_own(self, tmp_path: Path) -> None:
        store = LocalStorage(tmp_path)

        link = await store.url("ab/cd/x.jpg", filename="x.jpg", content_type="image/jpeg")

        # Nothing but Setout can reach a local disk, so Setout serves the file.
        assert link is None


class FakeS3:
    """Only the five calls the S3 backend makes."""

    def __init__(self, missing: bool = False) -> None:
        self.missing = missing
        self.written: dict[str, bytes] = {}
        self.calls: list[tuple[str, dict]] = []

    def put_object(self, **kw: object) -> None:
        self.calls.append(("put_object", dict(kw)))
        self.written[str(kw["Key"])] = bytes(kw["Body"])  # type: ignore[arg-type]

    def get_object(self, **kw: object) -> dict:
        self.calls.append(("get_object", dict(kw)))
        if self.missing:
            raise self._gone()
        return {"Body": io.BytesIO(self.written[str(kw["Key"])])}

    def head_object(self, **kw: object) -> dict:
        self.calls.append(("head_object", dict(kw)))
        if self.missing:
            raise self._gone()
        return {}

    def delete_object(self, **kw: object) -> None:
        self.calls.append(("delete_object", dict(kw)))
        self.written.pop(str(kw["Key"]), None)

    def generate_presigned_url(self, op: str, **kw: object) -> str:
        self.calls.append((op, dict(kw)))
        return "https://bucket.example/signed"

    def _gone(self) -> ClientError:
        return ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")


class TestS3Storage:
    def store(self, client: FakeS3, prefix: str = "attachments") -> S3Storage:
        return S3Storage("a-bucket", prefix=prefix, client=client)

    async def test_a_file_written_comes_back_whole(self) -> None:
        client = FakeS3()
        store = self.store(client)

        await store.put("ab/cd/x.jpg", b"a receipt", content_type="image/jpeg")

        assert await store.get("ab/cd/x.jpg") == b"a receipt"
        assert client.calls[0][1]["Bucket"] == "a-bucket"
        assert client.calls[0][1]["ContentType"] == "image/jpeg"

    async def test_the_prefix_keeps_setout_to_its_own_corner_of_the_bucket(self) -> None:
        client = FakeS3()
        store = self.store(client, prefix="receipts/")

        await store.put("ab/cd/x.jpg", b"x", content_type="image/jpeg")

        assert list(client.written) == ["receipts/ab/cd/x.jpg"]

    async def test_no_prefix_writes_to_the_root_of_the_bucket(self) -> None:
        client = FakeS3()
        store = self.store(client, prefix="")

        await store.put("ab/cd/x.jpg", b"x", content_type="image/jpeg")

        assert list(client.written) == ["ab/cd/x.jpg"]

    async def test_a_file_that_is_not_there_says_so_the_same_way_local_does(self) -> None:
        store = self.store(FakeS3(missing=True))

        assert await store.exists("ab/cd/x.jpg") is False
        with pytest.raises(FileNotFoundError):
            await store.get("ab/cd/x.jpg")

    async def test_it_hands_out_a_link_so_the_bytes_skip_setout(self) -> None:
        client = FakeS3()
        store = self.store(client)

        link = await store.url(
            "ab/cd/x.jpg", filename="receipt_16aug.jpg", content_type="image/jpeg"
        )

        assert link == "https://bucket.example/signed"
        params = client.calls[0][1]["Params"]
        # The stored name is a hash, so the real name rides on the link.
        assert 'filename="receipt_16aug.jpg"' in params["ResponseContentDisposition"]
        assert params["ResponseContentType"] == "image/jpeg"


class TestPickingABackend:
    def test_it_keeps_files_on_the_disk_beside_the_database_by_default(
        self, tmp_path: Path
    ) -> None:
        store = build_storage(Settings(data_dir=tmp_path))

        assert isinstance(store, LocalStorage)
        assert store.root == tmp_path / "attachments"

    def test_it_uses_a_bucket_when_one_is_configured(self) -> None:
        store = build_storage(
            Settings(
                storage_backend="s3",
                s3_bucket="a-bucket",
                s3_endpoint_url="https://minio.example",
                s3_access_key_id="key",
                s3_secret_access_key="secret",
                s3_use_path_style=True,
            )
        )

        assert isinstance(store, S3Storage)
        assert store.bucket == "a-bucket"
