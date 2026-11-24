from __future__ import annotations

from collections.abc import Iterable, Iterator

# Databases cap the size of an IN list; long lists are split into batches
# well under every common limit.
BATCH_SIZE = 500


def chunked[T](rows: Iterable[T], size: int = BATCH_SIZE) -> Iterator[list[T]]:
    batch: list[T] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch
