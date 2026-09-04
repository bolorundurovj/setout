"""Integration tests for the papers kept against a plot of land."""

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

SCAN = b"\xff\xd8\xff\xe0 not really a jpeg, but bytes are bytes"


async def _setup(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post("/api/lands", json={"name": "Ewuru plot"})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _upload(
    client: AsyncClient,
    land_id: str,
    *,
    data: bytes = SCAN,
    filename: str = "c-of-o.jpg",
    content_type: str = "image/jpeg",
    kind: str = "certificate_of_occupancy",
    note: str | None = None,
) -> tuple[int, dict]:
    form = {"kind": kind}
    if note is not None:
        form["note"] = note
    resp = await client.post(
        f"/api/lands/{land_id}/documents",
        files={"file": (filename, data, content_type)},
        data=form,
    )
    return resp.status_code, resp.json() if resp.content else {}


async def test_documents_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/lands/whatever/documents")).status_code == 401


async def test_a_paper_is_kept_against_the_land(client: AsyncClient) -> None:
    land_id = await _setup(client)

    code, body = await _upload(client, land_id)

    assert code == 201, body
    assert body["land_id"] == land_id
    assert body["kind"] == "certificate_of_occupancy"
    assert body["filename"] == "c-of-o.jpg"
    assert body["byte_size"] == len(SCAN)
    listed = await client.get(f"/api/lands/{land_id}/documents")
    assert listed.json()["total"] == 1


async def test_a_paper_comes_back_exactly_as_it_went_in(client: AsyncClient) -> None:
    land_id = await _setup(client)
    _, body = await _upload(client, land_id)

    resp = await client.get(f"/api/land-documents/{body['id']}/file")

    assert resp.status_code == 200
    assert resp.content == SCAN
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert "c-of-o.jpg" in resp.headers["content-disposition"]


async def test_the_land_stops_asking_for_a_paper_it_has(client: AsyncClient) -> None:
    land_id = await _setup(client)
    await _upload(client, land_id)

    land = (await client.get(f"/api/lands/{land_id}")).json()

    assert land["document_count"] == 1
    assert land["missing_kinds"] == ["survey_plan", "deed"]


async def test_the_same_scan_twice_is_stored_once(client: AsyncClient) -> None:
    land_id = await _setup(client)

    _, first = await _upload(client, land_id, kind="certificate_of_occupancy")
    _, second = await _upload(client, land_id, kind="deed")

    assert first["id"] != second["id"]
    assert first["checksum"] == second["checksum"]
    assert (await client.get(f"/api/land-documents/{second['id']}/file")).content == SCAN


async def test_a_spreadsheet_is_not_a_land_document(client: AsyncClient) -> None:
    land_id = await _setup(client)

    code, body = await _upload(
        client, land_id, filename="plan.xls", content_type="application/vnd.ms-excel"
    )

    assert code == 415
    assert "photograph" in body["detail"]


async def test_an_empty_file_is_refused(client: AsyncClient) -> None:
    land_id = await _setup(client)
    code, body = await _upload(client, land_id, data=b"")
    assert code == 400
    assert body["detail"] == "That file is empty"


async def test_a_file_past_the_limit_is_refused(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from setout.config import get_settings

    land_id = await _setup(client)
    settings = get_settings()
    monkeypatch.setattr(settings, "max_attachment_bytes", 16)

    code, _ = await _upload(client, land_id, data=b"x" * 17)

    assert code == 413


async def test_a_path_in_the_filename_does_not_survive(client: AsyncClient) -> None:
    land_id = await _setup(client)

    _, body = await _upload(client, land_id, filename="../../etc/passwd.jpg")

    assert body["filename"] == "passwd.jpg"


async def test_a_document_on_land_that_is_not_there_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    code, body = await _upload(client, "nope")
    assert code == 404
    assert body["detail"] == "Land not found"


async def test_a_removed_paper_leaves_the_list_and_can_come_back(client: AsyncClient) -> None:
    land_id = await _setup(client)
    _, body = await _upload(client, land_id)

    assert (await client.delete(f"/api/land-documents/{body['id']}")).status_code == 204
    assert (await client.get(f"/api/lands/{land_id}/documents")).json()["total"] == 0

    resp = await client.post(f"/api/land-documents/{body['id']}/restore")
    assert resp.status_code == 200
    assert (await client.get(f"/api/lands/{land_id}/documents")).json()["total"] == 1


async def test_archiving_the_land_takes_its_papers_and_gives_them_back(
    client: AsyncClient,
) -> None:
    land_id = await _setup(client)
    _, body = await _upload(client, land_id)

    await client.delete(f"/api/lands/{land_id}")
    assert (await client.get(f"/api/land-documents/{body['id']}")).status_code == 404

    await client.post(f"/api/lands/{land_id}/restore")
    assert (await client.get(f"/api/land-documents/{body['id']}")).status_code == 200


async def test_a_paper_removed_first_stays_removed_when_the_land_comes_back(
    client: AsyncClient,
) -> None:
    land_id = await _setup(client)
    _, body = await _upload(client, land_id)

    await client.delete(f"/api/land-documents/{body['id']}")
    await client.delete(f"/api/lands/{land_id}")
    await client.post(f"/api/lands/{land_id}/restore")

    assert (await client.get(f"/api/land-documents/{body['id']}")).status_code == 404


async def test_an_other_paper_can_say_what_it_actually_is(client: AsyncClient) -> None:
    land_id = await _setup(client)

    _, row = await _upload(client, land_id, kind="other", note="Land Use Charge receipt")

    assert row["kind"] == "other"
    assert row["note"] == "Land Use Charge receipt"


async def test_a_paper_kept_without_a_note_has_none(client: AsyncClient) -> None:
    land_id = await _setup(client)

    _, row = await _upload(client, land_id)

    assert row["note"] is None


async def test_a_note_is_written_after_the_file_is_already_kept(client: AsyncClient) -> None:
    land_id = await _setup(client)
    _, row = await _upload(client, land_id, kind="other")

    resp = await client.patch(
        f"/api/land-documents/{row['id']}", json={"note": "Land Use Charge receipt"}
    )

    assert resp.status_code == 200
    assert resp.json()["note"] == "Land Use Charge receipt"


async def test_a_paper_filed_under_the_wrong_kind_is_moved(client: AsyncClient) -> None:
    land_id = await _setup(client)
    _, row = await _upload(client, land_id, kind="other")

    resp = await client.patch(f"/api/land-documents/{row['id']}", json={"kind": "receipt"})

    assert resp.status_code == 200
    assert resp.json()["kind"] == "receipt"


async def test_correcting_a_paper_that_is_not_there(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.patch("/api/land-documents/nosuchdoc", json={"note": "anything"})

    assert resp.status_code == 404
