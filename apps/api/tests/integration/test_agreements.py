import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _vendor(client: AsyncClient, name: str = "Idris Bricklaying") -> str:
    resp = await client.post("/api/vendors", json={"name": name, "trade": "bricklayer"})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _person(client: AsyncClient, name: str = "Mummy") -> str:
    resp = await client.post("/api/people", json={"name": name})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _agreement(client: AsyncClient, project_id: str, vendor_id: str, agreed: int) -> dict:
    resp = await client.post(
        f"/api/projects/{project_id}/agreements",
        json={"vendor_id": vendor_id, "description": "Block work", "agreed_amount": agreed},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _pay(client: AsyncClient, project_id: str, agreement_id: str, amount: int) -> None:
    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={
            "description": "Part payment",
            "amount": amount,
            "agreement_id": agreement_id,
            "cost_type": "labour",
        },
    )
    assert resp.status_code == 201, resp.text


async def test_agreements_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/nope/agreements")).status_code == 401


async def test_a_new_agreement_owes_the_whole_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    agreement = await _agreement(client, project_id, vendor_id, 223_000_00)

    assert agreement["agreed_amount"] == 223_000_00
    assert agreement["paid_amount"] == 0
    assert agreement["balance_amount"] == 223_000_00
    assert agreement["vendor_name"] == "Idris Bricklaying"


async def test_part_payments_come_off_the_balance(client: AsyncClient) -> None:
    # Idris Bricklaying: agreed 223,000, paid in five parts, balance 60,000.
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    agreement = await _agreement(client, project_id, vendor_id, 223_000_00)

    for part in (70_000_00, 20_000_00, 40_000_00, 13_000_00, 20_000_00):
        await _pay(client, project_id, agreement["id"], part)

    read = (await client.get(f"/api/agreements/{agreement['id']}")).json()
    assert read["paid_amount"] == 163_000_00
    assert read["balance_amount"] == 60_000_00


async def test_the_balance_follows_a_deleted_payment(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    agreement = await _agreement(client, project_id, vendor_id, 100_000)
    await _pay(client, project_id, agreement["id"], 40_000)

    listed = (await client.get(f"/api/projects/{project_id}/expenses")).json()["items"]
    await client.delete(f"/api/expenses/{listed[0]['id']}")

    read = (await client.get(f"/api/agreements/{agreement['id']}")).json()
    assert read["paid_amount"] == 0
    assert read["balance_amount"] == 100_000


async def test_overpaying_owes_nothing_rather_than_a_negative(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    agreement = await _agreement(client, project_id, vendor_id, 50_000)
    await _pay(client, project_id, agreement["id"], 80_000)

    read = (await client.get(f"/api/agreements/{agreement['id']}")).json()
    assert read["paid_amount"] == 80_000
    assert read["balance_amount"] == 0


async def test_an_agreement_needs_a_vendor_that_exists(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.post(
        f"/api/projects/{project_id}/agreements",
        json={"vendor_id": "nope", "description": "Block work", "agreed_amount": 1000},
    )
    assert resp.status_code == 404


async def test_an_advance_is_recorded_against_a_person(client: AsyncClient) -> None:
    project_id = await _project(client)
    person_id = await _person(client)

    resp = await client.post(
        f"/api/projects/{project_id}/advances",
        json={"person_id": person_id, "amount": 100_000_00},
    )
    assert resp.status_code == 201
    assert resp.json()["person_name"] == "Mummy"
    assert resp.json()["amount"] == 100_000_00
    assert resp.json()["given_on"]


async def test_a_balance_is_what_was_advanced_less_what_was_spent(client: AsyncClient) -> None:
    # Mummy is handed 100,000 and spends 62,500, so she still holds 37,500.
    project_id = await _project(client)
    person_id = await _person(client)

    await client.post(
        f"/api/projects/{project_id}/advances",
        json={"person_id": person_id, "amount": 100_000_00},
    )
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Sand", "amount": 62_500_00, "paid_by_id": person_id},
    )

    balances = (await client.get(f"/api/projects/{project_id}/balances")).json()
    assert len(balances) == 1
    assert balances[0]["person_name"] == "Mummy"
    assert balances[0]["advanced_amount"] == 100_000_00
    assert balances[0]["spent_amount"] == 62_500_00
    assert balances[0]["balance_amount"] == 37_500_00


async def test_spending_more_than_was_advanced_leaves_them_owed(client: AsyncClient) -> None:
    project_id = await _project(client)
    person_id = await _person(client)

    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Cement", "amount": 11_000_00, "paid_by_id": person_id},
    )

    balances = (await client.get(f"/api/projects/{project_id}/balances")).json()
    assert balances[0]["balance_amount"] == -11_000_00


async def test_someone_with_nothing_to_settle_is_left_out(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _person(client, "Nobody")

    assert (await client.get(f"/api/projects/{project_id}/balances")).json() == []


async def test_an_advance_needs_a_person_that_exists(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.post(
        f"/api/projects/{project_id}/advances",
        json={"person_id": "nope", "amount": 1000},
    )
    assert resp.status_code == 404


async def test_agreements_and_advances_are_paginated(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    person_id = await _person(client)
    for _ in range(3):
        await _agreement(client, project_id, vendor_id, 1000)
        await client.post(
            f"/api/projects/{project_id}/advances",
            json={"person_id": person_id, "amount": 1000},
        )

    page = (await client.get(f"/api/projects/{project_id}/agreements", params={"limit": 2})).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2

    page = (await client.get(f"/api/projects/{project_id}/advances", params={"limit": 2})).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


async def test_missing_things_answer_404(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/agreements/nope")).status_code == 404
    assert (await client.delete("/api/agreements/nope")).status_code == 404
    stale = await client.patch("/api/agreements/nope", json={"agreed_amount": 1})
    assert stale.status_code == 404
    assert (await client.delete("/api/advances/nope")).status_code == 404
    assert (await client.patch("/api/advances/nope", json={"amount": 1})).status_code == 404
    assert (await client.get("/api/projects/nope/balances")).status_code == 404


async def test_the_payments_on_an_agreement_can_be_listed(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    agreement = await _agreement(client, project_id, vendor_id, 223_000_00)
    await _pay(client, project_id, agreement["id"], 70_000_00)
    await _pay(client, project_id, agreement["id"], 20_000_00)

    # Spend that is nothing to do with the agreement stays out of it.
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Cement", "amount": 11_000_00},
    )

    page = (
        await client.get(
            f"/api/projects/{project_id}/expenses",
            params={"agreement_id": agreement["id"]},
        )
    ).json()
    assert page["total"] == 2
    assert sum(row["amount"] for row in page["items"]) == 90_000_00
