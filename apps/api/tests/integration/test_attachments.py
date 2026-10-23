import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

JPEG_BYTES = b"\xff\xd8\xff\xe0 jpeg header stub"


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _expense(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "17 bags of cement", "amount": 76_500_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _attach(
    client: AsyncClient,
    project_id: str,
    expense_id: str,
    *,
    data: bytes = JPEG_BYTES,
    filename: str = "receipt_16aug.jpg",
    content_type: str = "image/jpeg",
) -> tuple[int, dict]:
    resp = await client.post(
        f"/api/projects/{project_id}/expenses/{expense_id}/attachments",
        files={"file": (filename, data, content_type)},
    )
    return resp.status_code, resp.json() if resp.content else {}


async def test_attachments_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/expenses/nope/attachments")).status_code == 401


async def test_attachment_is_stored_on_its_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    code, attachment = await _attach(client, project_id, expense["id"])

    assert code == 201, attachment
    assert attachment["filename"] == "receipt_16aug.jpg"
    assert attachment["content_type"] == "image/jpeg"
    assert attachment["byte_size"] == len(JPEG_BYTES)
    assert attachment["expense_id"] == expense["id"]

    listing = (await client.get(f"/api/expenses/{expense['id']}/attachments")).json()
    assert listing["total"] == 1


async def test_download_returns_identical_bytes(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    _, attachment = await _attach(client, project_id, expense["id"])

    resp = await client.get(f"/api/attachments/{attachment['id']}/file")

    assert resp.status_code == 200
    assert resp.content == JPEG_BYTES
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert "receipt_16aug.jpg" in resp.headers["content-disposition"]


async def test_identical_uploads_share_one_stored_file(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _expense(client, project_id)
    second = await _expense(client, project_id, description="Another load")

    _, one = await _attach(client, project_id, first["id"])
    _, two = await _attach(client, project_id, second["id"])

    # Content-addressed storage: identical bytes share one stored file.
    assert one["id"] != two["id"]
    assert one["checksum"] == two["checksum"]
    both = await client.get(f"/api/attachments/{two['id']}/file")
    assert both.content == JPEG_BYTES


async def test_spreadsheet_upload_is_rejected_with_415(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    code, body = await _attach(
        client,
        project_id,
        expense["id"],
        filename="prices.xlsx",
        content_type="application/vnd.ms-excel",
    )

    assert code == 415
    assert body["detail"] == "An attachment must be an image or a PDF"


async def test_empty_file_is_rejected(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    code, body = await _attach(client, project_id, expense["id"], data=b"")

    assert code == 400
    assert body["detail"] == "That file is empty"


async def test_file_over_size_limit_is_rejected(client: AsyncClient, monkeypatch) -> None:
    from setout.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_attachment_bytes", 16)
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    code, body = await _attach(client, project_id, expense["id"], data=b"x" * 17)

    assert code == 413
    assert "larger than" in body["detail"]


async def test_path_components_are_stripped_from_filename(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    _, attachment = await _attach(
        client, project_id, expense["id"], filename="../../etc/passwd.jpg"
    )

    assert attachment["filename"] == "passwd.jpg"


async def test_expense_from_another_project_returns_404(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = await client.post(
        "/api/projects", json={"name": "Somewhere else", "currency_code": "NGN"}
    )
    expense = await _expense(client, project_id)

    code, body = await _attach(client, other.json()["id"], expense["id"])

    assert code == 404
    assert body["detail"] == "Expense not found"


async def test_archived_attachment_is_hidden_and_restorable(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    _, attachment = await _attach(client, project_id, expense["id"])

    assert (await client.post(f"/api/attachments/{attachment['id']}/archive")).status_code == 204
    listing = (await client.get(f"/api/expenses/{expense['id']}/attachments")).json()
    assert listing["total"] == 0
    assert (await client.get(f"/api/attachments/{attachment['id']}")).status_code == 404

    restored = await client.post(f"/api/attachments/{attachment['id']}/restore")
    assert restored.status_code == 200
    listing = (await client.get(f"/api/expenses/{expense['id']}/attachments")).json()
    assert listing["total"] == 1


async def test_archived_attachment_is_listed_with_include_archived(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    _, attachment = await _attach(client, project_id, expense["id"])
    await client.post(f"/api/attachments/{attachment['id']}/archive")

    listing = (
        await client.get(f"/api/expenses/{expense['id']}/attachments?include_archived=true")
    ).json()

    assert [row["id"] for row in listing["items"]] == [attachment["id"]]


async def test_backup_includes_attachments(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await _attach(client, project_id, expense["id"])

    backup = (await client.get("/api/install/export")).json()

    assert backup["row_counts"]["attachment"] == 1


async def test_expense_reports_attachment_count(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    plain = await _expense(client, project_id, description="Nothing attached")
    _, attachment = await _attach(client, project_id, expense["id"])

    listing = (await client.get(f"/api/projects/{project_id}/expenses")).json()
    counts = {row["id"]: row["attachment_count"] for row in listing["items"]}

    assert counts[expense["id"]] == 1
    assert counts[plain["id"]] == 0

    # Archived attachments are not counted.
    await client.post(f"/api/attachments/{attachment['id']}/archive")
    again = (await client.get(f"/api/expenses/{expense['id']}")).json()
    assert again["attachment_count"] == 0
