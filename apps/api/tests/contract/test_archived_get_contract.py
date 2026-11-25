from __future__ import annotations

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = pytest.mark.contract

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


async def _sign_in(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    resp = await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    assert resp.status_code == 200


async def test_every_entity_get_returns_archived_record_with_archived_at(
    client: AsyncClient,
) -> None:
    await _sign_in(client)

    land = (await client.post("/api/lands", json={"name": "Plot A"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Acme Supply"})).json()
    person = (await client.post("/api/people", json={"name": "Ada Okafor"})).json()
    item = (await client.post("/api/items", json={"name": "Cement", "unit": "bag"})).json()
    project = (
        await client.post(
            "/api/projects",
            json={"name": "Site One", "currency_code": "NGN", "land_id": land["id"]},
        )
    ).json()

    agreement = (
        await client.post(
            f"/api/projects/{project['id']}/agreements",
            json={
                "vendor_id": vendor["id"],
                "description": "Plumbing",
                "agreed_amount": 100_00,
            },
        )
    ).json()
    expense = (
        await client.post(
            f"/api/projects/{project['id']}/expenses",
            json={
                "description": "Cement bags",
                "amount": 50_00,
                "spent_on": "2026-01-12",
                "cost_type": "material",
                "vendor_id": vendor["id"],
            },
        )
    ).json()
    delivery = (
        await client.post(
            f"/api/projects/{project['id']}/deliveries",
            json={"expense_id": expense["id"], "expected_on": "2026-01-15"},
        )
    ).json()
    attachment = (
        await client.post(
            f"/api/projects/{project['id']}/expenses/{expense['id']}/attachments",
            files={"file": ("receipt.pdf", PDF_BYTES, "application/pdf")},
        )
    ).json()
    land_document = (
        await client.post(
            f"/api/lands/{land['id']}/documents",
            data={"kind": "survey_plan"},
            files={"file": ("survey.pdf", PDF_BYTES, "application/pdf")},
        )
    ).json()

    # Archive from leaves up to parents, verifying GET /{id} still returns 200 with archived_at set.
    entities: list[tuple[str, str]] = [
        ("attachment", f"/api/attachments/{attachment['id']}"),
        ("delivery", f"/api/deliveries/{delivery['id']}"),
        ("expense", f"/api/expenses/{expense['id']}"),
        ("agreement", f"/api/agreements/{agreement['id']}"),
        ("land_document", f"/api/land-documents/{land_document['id']}"),
        ("item", f"/api/items/{item['id']}"),
        ("person", f"/api/people/{person['id']}"),
        ("vendor", f"/api/vendors/{vendor['id']}"),
    ]

    for name, url in entities:
        archive_resp = await client.post(f"{url}/archive")
        assert archive_resp.status_code == 204, f"{name} archive failed: {archive_resp.text}"
        get_resp = await client.get(url)
        assert get_resp.status_code == 200, (
            f"{name} GET after archive returned {get_resp.status_code}"
        )
        assert get_resp.json()["archived_at"] is not None, f"{name} missing archived_at"

    # Project must be closed before archiving.
    assert (
        await client.patch(f"/api/projects/{project['id']}", json={"status": "closed"})
    ).status_code == 200
    assert (await client.post(f"/api/projects/{project['id']}/archive")).status_code == 204
    project_resp = await client.get(f"/api/projects/{project['id']}")
    assert project_resp.status_code == 200
    assert project_resp.json()["archived_at"] is not None

    # Land
    assert (await client.post(f"/api/lands/{land['id']}/archive")).status_code == 204
    land_resp = await client.get(f"/api/lands/{land['id']}")
    assert land_resp.status_code == 200
    assert land_resp.json()["archived_at"] is not None

    # Archived attachment and land document files remain retrievable as well.
    assert (await client.get(f"/api/attachments/{attachment['id']}/file")).status_code == 200
    assert (await client.get(f"/api/land-documents/{land_document['id']}/file")).status_code == 200
