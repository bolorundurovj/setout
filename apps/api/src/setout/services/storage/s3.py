"""Files in an S3 compatible bucket."""

from __future__ import annotations

import asyncio
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from setout.services.storage.base import Storage

MISSING = ("404", "NoSuchKey", "NotFound")


class S3Storage(Storage):
    def __init__(
        self,
        bucket: str,
        *,
        prefix: str = "",
        endpoint_url: str | None = None,
        region: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        use_path_style: bool = False,
        link_seconds: int = 300,
        client: Any | None = None,
    ) -> None:
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.link_seconds = link_seconds
        self.client = client or boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id or None,
            aws_secret_access_key=secret_access_key or None,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path" if use_path_style else "auto"},
            ),
        )

    async def put(self, key: str, data: bytes, *, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=self._at(key),
            Body=data,
            ContentType=content_type,
        )

    async def get(self, key: str) -> bytes:
        try:
            answer = await asyncio.to_thread(
                self.client.get_object, Bucket=self.bucket, Key=self._at(key)
            )
        except ClientError as e:
            if self._is_missing(e):
                raise FileNotFoundError(key) from e
            raise
        body: bytes = await asyncio.to_thread(answer["Body"].read)
        return body

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=self._at(key))

    async def exists(self, key: str) -> bool:
        try:
            await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=self._at(key))
        except ClientError as e:
            if self._is_missing(e):
                return False
            raise
        return True

    async def url(self, key: str, *, filename: str, content_type: str) -> str:
        """A link that expires, carrying the real name rather than the hash."""
        link: str = await asyncio.to_thread(
            self.client.generate_presigned_url,
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": self._at(key),
                "ResponseContentType": content_type,
                "ResponseContentDisposition": f'inline; filename="{filename}"',
            },
            ExpiresIn=self.link_seconds,
        )
        return link

    def _at(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def _is_missing(self, error: ClientError) -> bool:
        answer: dict[str, Any] = error.response.get("Error", {})
        return str(answer.get("Code")) in MISSING
