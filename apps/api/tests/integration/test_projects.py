import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _sign_in(client: AsyncClient) -> None:
    wanted = {"NGN", "JPY"}
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] in wanted]
    )
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "password": "password123"},
    )
    assert resp.status_code == 200


async def _create(client: AsyncClient, **overrides: object) -> dict:
    body = {"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"} | overrides
    resp = await client.post("/api/projects", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_projects_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects")).status_code == 401
    assert (await client.get("/api/currencies")).status_code == 401


async def test_currencies_are_seeded_and_listed(client: AsyncClient) -> None:
    await _sign_in(client)
    resp = await client.get("/api/currencies")
    assert resp.status_code == 200
    codes = {c["code"] for c in resp.json()}
    assert {"NGN", "JPY"} <= codes
    by_code = {c["code"]: c for c in resp.json()}
    assert by_code["NGN"]["exponent"] == 2
    assert by_code["JPY"]["exponent"] == 0


async def test_create_and_list_a_project(client: AsyncClient) -> None:
    await _sign_in(client)
    created = await _create(client)
    assert created["currency_code"] == "NGN"
    assert created["currency_exponent"] == 2
    assert created["status"] == "active"
    assert created["deleted_at"] is None

    page = (await client.get("/api/projects")).json()
    assert [p["id"] for p in page["items"]] == [created["id"]]
    assert page["total"] == 1
    assert page["limit"] == 20
    assert page["offset"] == 0


async def test_an_unknown_currency_is_rejected(client: AsyncClient) -> None:
    await _sign_in(client)
    resp = await client.post(
        "/api/projects",
        json={"name": "Nowhere", "currency_code": "ZZZ"},
    )
    assert resp.status_code == 422


async def test_the_currency_cannot_be_changed(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)

    resp = await client.patch(f"/api/projects/{project['id']}", json={"currency_code": "JPY"})
    assert resp.status_code == 422

    unchanged = (await client.get(f"/api/projects/{project['id']}")).json()
    assert unchanged["currency_code"] == "NGN"


async def test_a_project_must_be_archived_before_it_is_deleted(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)

    resp = await client.delete(f"/api/projects/{project['id']}")
    assert resp.status_code == 409

    await client.patch(f"/api/projects/{project['id']}", json={"status": "archived"})
    assert (await client.delete(f"/api/projects/{project['id']}")).status_code == 204


async def test_a_deleted_project_is_hidden_and_restorable(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)
    await client.patch(f"/api/projects/{project['id']}", json={"status": "archived"})
    await client.delete(f"/api/projects/{project['id']}")

    assert (await client.get("/api/projects")).json()["items"] == []
    assert (await client.get(f"/api/projects/{project['id']}")).status_code == 404

    with_deleted = (await client.get("/api/projects", params={"include_deleted": True})).json()
    assert [p["id"] for p in with_deleted["items"]] == [project["id"]]

    restored = await client.post(f"/api/projects/{project['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert len((await client.get("/api/projects")).json()["items"]) == 1


async def test_name_and_notes_can_be_updated(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)
    resp = await client.patch(
        f"/api/projects/{project['id']}",
        json={"name": "Owode Bungalow", "notes": "Second site"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Owode Bungalow"
    assert resp.json()["notes"] == "Second site"


async def test_summary_counts_by_status(client: AsyncClient) -> None:
    await _sign_in(client)
    active = await _create(client)
    archived = await _create(client, name="Owode Bungalow")
    deleted = await _create(client, name="Gone", currency_code="JPY")

    await client.patch(f"/api/projects/{archived['id']}", json={"status": "archived"})
    await client.patch(f"/api/projects/{deleted['id']}", json={"status": "archived"})
    await client.delete(f"/api/projects/{deleted['id']}")

    resp = await client.get("/api/project-summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["active"] == 1
    assert body["archived"] == 1
    assert body["deleted"] == 1
    assert body["currency_codes"] == ["NGN"]
    assert active["id"] != archived["id"]


async def test_summary_lists_every_currency_in_use(client: AsyncClient) -> None:
    await _sign_in(client)
    await _create(client)
    await _create(client, name="Tokyo", currency_code="JPY")

    body = (await client.get("/api/project-summary")).json()
    assert body["currency_codes"] == ["JPY", "NGN"]


async def test_the_list_is_paginated(client: AsyncClient) -> None:
    await _sign_in(client)
    for index in range(5):
        await _create(client, name=f"Site {index}")

    first = (await client.get("/api/projects", params={"limit": 2})).json()
    assert first["total"] == 5
    assert first["limit"] == 2
    assert len(first["items"]) == 2

    second = (await client.get("/api/projects", params={"limit": 2, "offset": 2})).json()
    assert len(second["items"]) == 2
    assert {p["id"] for p in first["items"]}.isdisjoint({p["id"] for p in second["items"]})

    last = (await client.get("/api/projects", params={"limit": 2, "offset": 4})).json()
    assert len(last["items"]) == 1


async def test_pagination_bounds_are_enforced(client: AsyncClient) -> None:
    await _sign_in(client)
    assert (await client.get("/api/projects", params={"limit": 0})).status_code == 422
    assert (await client.get("/api/projects", params={"limit": 101})).status_code == 422
    assert (await client.get("/api/projects", params={"offset": -1})).status_code == 422


async def _archive_and_delete(client: AsyncClient, project_id: str) -> None:
    assert (
        await client.patch(f"/api/projects/{project_id}", json={"status": "archived"})
    ).status_code == 200
    assert (await client.delete(f"/api/projects/{project_id}")).status_code == 204


async def test_deleting_a_project_takes_everything_it_owns(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)
    scope = (
        await client.post(f"/api/projects/{project['id']}/scopes", json={"name": "Foundation"})
    ).json()
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Sand", "planned_amount": 100_000_00},
    )
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()
    spend = (
        await client.post(
            f"/api/projects/{project['id']}/expenses",
            json={
                "description": "Cement",
                "amount": 40_000_00,
                "scope_id": scope["id"],
                "vendor_id": vendor["id"],
            },
        )
    ).json()
    await client.post(
        f"/api/projects/{project['id']}/deliveries",
        json={"expense_id": spend["id"], "description": "17 bags"},
    )

    await _archive_and_delete(client, project["id"])

    spent = (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()
    assert spent["projects"] == []
    scopes = await client.get(f"/api/projects/{project['id']}/scopes")
    assert scopes.status_code == 404
    assert (await client.get("/api/deliveries")).json()["items"] == []


async def test_restoring_a_project_brings_back_what_it_took(client: AsyncClient) -> None:
    await _sign_in(client)
    project = await _create(client)
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()
    await client.post(
        f"/api/projects/{project['id']}/expenses",
        json={"description": "Cement", "amount": 40_000_00, "vendor_id": vendor["id"]},
    )

    await _archive_and_delete(client, project["id"])
    assert (await client.post(f"/api/projects/{project['id']}/restore")).status_code == 200

    spent = (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()
    assert [row["expense_count"] for row in spent["projects"]] == [1]


async def test_a_restored_project_leaves_what_was_deleted_on_purpose_deleted(
    client: AsyncClient,
) -> None:
    await _sign_in(client)
    project = await _create(client)
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()
    kept = (
        await client.post(
            f"/api/projects/{project['id']}/expenses",
            json={"description": "Cement", "amount": 40_000_00, "vendor_id": vendor["id"]},
        )
    ).json()
    gone = (
        await client.post(
            f"/api/projects/{project['id']}/expenses",
            json={"description": "Nails", "amount": 2_500_00, "vendor_id": vendor["id"]},
        )
    ).json()
    assert (await client.delete(f"/api/expenses/{gone['id']}")).status_code == 204

    await _archive_and_delete(client, project["id"])
    await client.post(f"/api/projects/{project['id']}/restore")

    live = (await client.get(f"/api/projects/{project['id']}/expenses")).json()
    assert [row["id"] for row in live["items"]] == [kept["id"]]
