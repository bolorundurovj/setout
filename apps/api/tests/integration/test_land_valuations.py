"""Integration tests for what a plot cost and what it has been worth since."""

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [
            Currency(code=c[0], name=c[1], exponent=c[2])
            for c in CURRENCIES
            if c[0] in ("NGN", "USD")
        ]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def _land(client: AsyncClient, name: str = "Ewuru plot") -> str:
    resp = await client.post("/api/lands", json={"name": name})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _value(client: AsyncClient, land_id: str, **body: object) -> tuple[int, dict]:
    payload = {"amount": 4500000, "currency_code": "NGN", "valued_on": "2023-03-11", **body}
    resp = await client.post(f"/api/lands/{land_id}/valuations", json=payload)
    return resp.status_code, resp.json() if resp.content else {}


async def test_valuations_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/lands/whatever/valuations")).status_code == 401


async def test_a_plot_keeps_what_it_was_bought_for(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)

    code, row = await _value(client, land_id, kind="purchase")

    assert code == 201, row
    assert row["kind"] == "purchase"
    assert row["amount"] == 4500000
    assert row["currency_code"] == "NGN"
    assert row["currency_exponent"] == 2


async def test_the_first_valuation_fixes_the_currency(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id, kind="purchase")

    land = (await client.get(f"/api/lands/{land_id}")).json()

    assert land["currency_code"] == "NGN"
    assert land["currency_exponent"] == 2


async def test_a_valuation_in_another_currency_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id, kind="purchase")

    code, body = await _value(client, land_id, currency_code="USD", valued_on="2025-01-02")

    assert code == 422
    assert "NGN" in body["detail"]


async def test_a_plot_is_bought_only_once(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id, kind="purchase")

    code, _ = await _value(client, land_id, kind="purchase", valued_on="2024-01-01")

    assert code == 409


async def test_the_history_reads_newest_first(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id, kind="purchase", amount=4500000, valued_on="2023-03-11")
    await _value(client, land_id, amount=6200000, valued_on="2025-01-02")
    await _value(client, land_id, amount=7000000, valued_on="2026-06-30")

    rows = (await client.get(f"/api/lands/{land_id}/valuations")).json()

    assert [row["amount"] for row in rows["items"]] == [7000000, 6200000, 4500000]
    assert rows["total"] == 3


async def test_a_plot_reports_what_it_cost_and_what_it_is_worth_now(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id, kind="purchase", amount=4500000, valued_on="2023-03-11")
    await _value(client, land_id, amount=7000000, valued_on="2026-06-30")

    land = (await client.get(f"/api/lands/{land_id}")).json()

    assert land["purchase_amount"] == 4500000
    assert land["current_value"] == 7000000
    assert land["valuation_count"] == 2


async def test_a_valuation_says_who_valued_it(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    _, row = await _value(client, land_id, note="Bank valuation for the mortgage")

    assert row["note"] == "Bank valuation for the mortgage"


async def test_a_valuation_can_be_corrected(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    _, row = await _value(client, land_id)

    resp = await client.patch(
        f"/api/land-valuations/{row['id']}", json={"amount": 5000000, "note": "Re-read the deed"}
    )

    assert resp.status_code == 200
    assert resp.json()["amount"] == 5000000
    assert resp.json()["note"] == "Re-read the deed"


async def test_a_removed_valuation_comes_back(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    _, row = await _value(client, land_id)

    assert (await client.delete(f"/api/land-valuations/{row['id']}")).status_code == 204
    assert (await client.get(f"/api/lands/{land_id}/valuations")).json()["total"] == 0

    resp = await client.post(f"/api/land-valuations/{row['id']}/restore")

    assert resp.status_code == 200
    assert (await client.get(f"/api/lands/{land_id}/valuations")).json()["total"] == 1


async def test_losing_every_valuation_frees_the_currency(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    _, row = await _value(client, land_id)
    await client.delete(f"/api/land-valuations/{row['id']}")

    assert (await client.get(f"/api/lands/{land_id}")).json()["currency_code"] is None

    code, _ = await _value(client, land_id, currency_code="USD")

    assert code == 201


async def test_archiving_a_plot_takes_its_valuations_with_it(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)
    await _value(client, land_id)
    await client.delete(f"/api/lands/{land_id}")

    assert (await client.get(f"/api/lands/{land_id}")).json()["valuation_count"] == 0

    await client.post(f"/api/lands/{land_id}/restore")

    assert (await client.get(f"/api/lands/{land_id}")).json()["valuation_count"] == 1


async def test_a_valuation_against_a_plot_that_is_not_there(client: AsyncClient) -> None:
    await _setup(client)

    code, _ = await _value(client, "nosuchland")

    assert code == 404


async def test_a_valuation_in_a_currency_that_is_not_there(client: AsyncClient) -> None:
    await _setup(client)
    land_id = await _land(client)

    code, body = await _value(client, land_id, currency_code="ZZZ")

    assert code == 422
    assert "ZZZ" in body["detail"]
