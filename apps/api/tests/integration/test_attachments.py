import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

PHOTO = b"\xff\xd8\xff\xe0 not really a jpeg, but bytes are bytes"


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _spend(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "17 bags of cement", "amount": 76_500_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _attach(
    client: AsyncClient,
    project_id: str,
    expense_id: str,
    *,
    data: bytes = PHOTO,
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


async def test_a_receipt_is_kept_beside_the_expense_that_paid_for_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    code, attachment = await _attach(client, project_id, spend["id"])

    assert code == 201, attachment
    assert attachment["filename"] == "receipt_16aug.jpg"
    assert attachment["content_type"] == "image/jpeg"
    assert attachment["byte_size"] == len(PHOTO)
    assert attachment["expense_id"] == spend["id"]

    listing = (await client.get(f"/api/expenses/{spend['id']}/attachments")).json()
    assert listing["total"] == 1


async def test_the_file_comes_back_exactly_as_it_went_in(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    _, attachment = await _attach(client, project_id, spend["id"])

    resp = await client.get(f"/api/attachments/{attachment['id']}/file")

    assert resp.status_code == 200
    assert resp.content == PHOTO
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert "receipt_16aug.jpg" in resp.headers["content-disposition"]


async def test_the_same_photograph_twice_is_stored_once(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _spend(client, project_id)
    second = await _spend(client, project_id, description="Another load")

    _, one = await _attach(client, project_id, first["id"])
    _, two = await _attach(client, project_id, second["id"])

    # Two records of the attachment, one file: the name is the hash of what is
    # inside it, so the second write lands on the first.
    assert one["id"] != two["id"]
    assert one["checksum"] == two["checksum"]
    both = await client.get(f"/api/attachments/{two['id']}/file")
    assert both.content == PHOTO


async def test_a_spreadsheet_is_not_a_receipt(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    code, answer = await _attach(
        client,
        project_id,
        spend["id"],
        filename="prices.xlsx",
        content_type="application/vnd.ms-excel",
    )

    assert code == 415
    assert "photograph" in answer["detail"]


async def test_an_empty_file_is_refused(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    code, answer = await _attach(client, project_id, spend["id"], data=b"")

    assert code == 400
    assert answer["detail"] == "That file is empty"


async def test_a_file_past_the_limit_is_refused(client: AsyncClient, monkeypatch) -> None:
    from setout.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_attachment_bytes", 16)
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    code, answer = await _attach(client, project_id, spend["id"], data=b"x" * 17)

    assert code == 413
    assert "larger than" in answer["detail"]


async def test_a_path_in_the_filename_does_not_survive(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    _, attachment = await _attach(client, project_id, spend["id"], filename="../../etc/passwd.jpg")

    assert attachment["filename"] == "passwd.jpg"


async def test_an_expense_on_another_project_is_refused(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = await client.post(
        "/api/projects", json={"name": "Somewhere else", "currency_code": "NGN"}
    )
    spend = await _spend(client, project_id)

    code, answer = await _attach(client, other.json()["id"], spend["id"])

    assert code == 404
    assert answer["detail"] == "Expense not found"


async def test_a_removed_receipt_leaves_the_list_and_can_come_back(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    _, attachment = await _attach(client, project_id, spend["id"])

    assert (await client.delete(f"/api/attachments/{attachment['id']}")).status_code == 204
    listing = (await client.get(f"/api/expenses/{spend['id']}/attachments")).json()
    assert listing["total"] == 0
    assert (await client.get(f"/api/attachments/{attachment['id']}")).status_code == 404

    restored = await client.post(f"/api/attachments/{attachment['id']}/restore")
    assert restored.status_code == 200
    listing = (await client.get(f"/api/expenses/{spend['id']}/attachments")).json()
    assert listing["total"] == 1


async def test_a_removed_receipt_can_still_be_found_when_asked_for(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    _, attachment = await _attach(client, project_id, spend["id"])
    await client.delete(f"/api/attachments/{attachment['id']}")

    listing = (
        await client.get(f"/api/expenses/{spend['id']}/attachments?include_deleted=true")
    ).json()

    assert [row["id"] for row in listing["items"]] == [attachment["id"]]


async def test_the_record_export_carries_attachments(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    await _attach(client, project_id, spend["id"])

    record = (await client.get("/api/install/export")).json()

    assert record["row_counts"]["attachment"] == 1


async def test_the_expense_says_how_many_files_are_kept_beside_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    plain = await _spend(client, project_id, description="Nothing attached")
    _, attachment = await _attach(client, project_id, spend["id"])

    listing = (await client.get(f"/api/projects/{project_id}/expenses")).json()
    counts = {row["id"]: row["attachment_count"] for row in listing["items"]}

    assert counts[spend["id"]] == 1
    assert counts[plain["id"]] == 0

    # A receipt taken off stops counting.
    await client.delete(f"/api/attachments/{attachment['id']}")
    again = (await client.get(f"/api/expenses/{spend['id']}")).json()
    assert again["attachment_count"] == 0
