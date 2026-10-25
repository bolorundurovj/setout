from pathlib import Path

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


async def _vendor(client: AsyncClient) -> str:
    resp = await client.post("/api/vendors", json={"name": "Adebayo Blocks"})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _agreement(client: AsyncClient, project_id: str) -> dict:
    resp = await client.post(
        f"/api/projects/{project_id}/agreements",
        json={
            "vendor_id": await _vendor(client),
            "description": "Block work",
            "agreed_amount": 1000,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _delivery(client: AsyncClient, project_id: str) -> dict:
    expense = await _expense(client, project_id)
    resp = await client.post(
        f"/api/projects/{project_id}/deliveries", json={"expense_id": expense["id"]}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(client: AsyncClient, path: str) -> dict:
    resp = await client.post(
        f"/api{path}", files={"file": ("contract.pdf", b"%PDF-1.7 stub", "application/pdf")}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _stored_files(tmp_path: Path) -> list[Path]:
    return [path for path in (tmp_path / "attachments").rglob("*") if path.is_file()]


async def test_project_attachment_is_listed_on_the_project_only(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await _attach(client, project_id, expense["id"])

    attachment = await _upload(client, f"/projects/{project_id}/attachments")

    assert attachment["project_id"] == project_id
    assert attachment["expense_id"] is None
    assert attachment["agreement_id"] is None
    assert attachment["delivery_id"] is None
    listing = (await client.get(f"/api/projects/{project_id}/attachments")).json()
    assert [row["id"] for row in listing["items"]] == [attachment["id"]]


async def test_agreement_attachment_is_listed_and_counted(client: AsyncClient) -> None:
    project_id = await _project(client)
    agreement = await _agreement(client, project_id)

    attachment = await _upload(
        client, f"/projects/{project_id}/agreements/{agreement['id']}/attachments"
    )

    assert attachment["agreement_id"] == agreement["id"]
    listing = (await client.get(f"/api/agreements/{agreement['id']}/attachments")).json()
    assert listing["total"] == 1
    again = (await client.get(f"/api/agreements/{agreement['id']}")).json()
    assert again["attachment_count"] == 1


async def test_delivery_attachment_is_listed_and_counted(client: AsyncClient) -> None:
    project_id = await _project(client)
    delivery = await _delivery(client, project_id)

    attachment = await _upload(
        client, f"/projects/{project_id}/deliveries/{delivery['id']}/attachments"
    )

    assert attachment["delivery_id"] == delivery["id"]
    listing = (await client.get(f"/api/deliveries/{delivery['id']}/attachments")).json()
    assert listing["total"] == 1
    again = (await client.get(f"/api/deliveries/{delivery['id']}")).json()
    assert again["attachment_count"] == 1


async def test_agreement_from_another_project_returns_404(client: AsyncClient) -> None:
    project_id = await _project(client)
    agreement = await _agreement(client, project_id)
    other = await client.post(
        "/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"}
    )

    resp = await client.post(
        f"/api/projects/{other.json()['id']}/agreements/{agreement['id']}/attachments",
        files={"file": ("contract.pdf", b"%PDF-1.7 stub", "application/pdf")},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Agreement not found"


async def test_archiving_an_agreement_archives_and_restores_its_attachments(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    agreement = await _agreement(client, project_id)
    await _upload(client, f"/projects/{project_id}/agreements/{agreement['id']}/attachments")

    await client.post(f"/api/agreements/{agreement['id']}/archive")
    listing = await client.get(
        f"/api/agreements/{agreement['id']}/attachments", params={"include_archived": True}
    )
    assert listing.status_code == 404

    await client.post(f"/api/agreements/{agreement['id']}/restore")
    restored = (await client.get(f"/api/agreements/{agreement['id']}/attachments")).json()
    assert restored["total"] == 1


async def test_archiving_an_expense_archives_its_delivery_attachments(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    delivery = await _delivery(client, project_id)
    attachment = await _upload(
        client, f"/projects/{project_id}/deliveries/{delivery['id']}/attachments"
    )

    await client.post(f"/api/expenses/{delivery['expense_id']}/archive")

    assert (await client.get(f"/api/attachments/{attachment['id']}")).status_code == 404

    await client.post(f"/api/expenses/{delivery['expense_id']}/restore")
    assert (await client.get(f"/api/attachments/{attachment['id']}")).status_code == 200


async def test_deleting_an_agreement_deletes_its_stored_files(
    client: AsyncClient, tmp_path: Path
) -> None:
    project_id = await _project(client)
    agreement = await _agreement(client, project_id)
    await _upload(client, f"/projects/{project_id}/agreements/{agreement['id']}/attachments")
    assert len(_stored_files(tmp_path)) == 1

    await client.post(f"/api/agreements/{agreement['id']}/archive")
    resp = await client.delete(f"/api/agreements/{agreement['id']}")

    assert resp.status_code == 204
    assert _stored_files(tmp_path) == []


async def test_deleting_a_project_deletes_its_project_attachment_files(
    client: AsyncClient, tmp_path: Path
) -> None:
    project_id = await _project(client)
    await _upload(client, f"/projects/{project_id}/attachments")
    assert len(_stored_files(tmp_path)) == 1

    await client.patch(f"/api/projects/{project_id}", json={"status": "closed"})
    await client.post(f"/api/projects/{project_id}/archive")
    resp = await client.delete(f"/api/projects/{project_id}")

    assert resp.status_code == 204
    assert _stored_files(tmp_path) == []
