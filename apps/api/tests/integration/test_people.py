import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient, *codes: str) -> dict[str, str]:
    wanted = codes or ("NGN",)
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] in wanted]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    projects = {}
    for code in wanted:
        resp = await client.post(
            "/api/projects", json={"name": f"House in {code}", "currency_code": code}
        )
        projects[code] = resp.json()["id"]
    return projects


async def _person(client: AsyncClient, name: str, **extra: object) -> dict:
    resp = await client.post("/api/people", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _spend(client: AsyncClient, project_id: str, person_id: str, amount: int) -> dict:
    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "A purchase", "amount": amount, "paid_by_id": person_id},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_people_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/people")).status_code == 401


async def test_somebody_needs_only_a_name(client: AsyncClient) -> None:
    await _setup(client)
    person = await _person(client, "Mum")

    assert person["name"] == "Mum"
    assert person["role"] is None
    assert person["expense_count"] == 0


async def test_a_person_keeps_how_they_relate_to_the_build(client: AsyncClient) -> None:
    await _setup(client)
    person = await _person(client, "Mum", role="family", phone="0800 000 0001")

    assert person["role"] == "family"
    assert person["phone"] == "0800 000 0001"


async def test_the_same_name_twice_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _person(client, "Mum")

    assert (await client.post("/api/people", json={"name": "mum"})).status_code == 409


async def test_people_can_be_searched_by_part_of_the_name(client: AsyncClient) -> None:
    await _setup(client)
    await _person(client, "Mr Idris")
    await _person(client, "Mr Femi Ade")
    await _person(client, "Mum")

    page = (await client.get("/api/people", params={"search": "Mr "})).json()
    assert page["total"] == 2


async def test_archiving_and_restoring_somebody(client: AsyncClient) -> None:
    await _setup(client)
    person = await _person(client, "Mum")

    assert (await client.delete(f"/api/people/{person['id']}")).status_code == 204
    assert (await client.get("/api/people")).json()["total"] == 0
    assert (await client.get("/api/people", params={"include_archived": True})).json()["total"] == 1

    restored = await client.post(f"/api/people/{person['id']}/restore")
    assert restored.json()["deleted_at"] is None
    assert (await client.get("/api/people")).json()["total"] == 1


async def test_what_somebody_spent_runs_across_every_project(client: AsyncClient) -> None:
    projects = await _setup(client, "NGN", "USD")
    person = await _person(client, "Mum")
    await _spend(client, projects["NGN"], person["id"], 37_500_00)
    await _spend(client, projects["USD"], person["id"], 200_00)

    spend = (await client.get(f"/api/people/{person['id']}/spend")).json()
    assert len(spend["projects"]) == 2
    by_code = {row["currency_code"]: row for row in spend["projects"]}
    assert by_code["NGN"]["spent_amount"] == 37_500_00
    assert by_code["USD"]["spent_amount"] == 200_00


async def test_several_purchases_are_summed_within_a_project(client: AsyncClient) -> None:
    projects = await _setup(client)
    person = await _person(client, "Mum")
    await _spend(client, projects["NGN"], person["id"], 20_000_00)
    await _spend(client, projects["NGN"], person["id"], 17_500_00)

    row = (await client.get(f"/api/people/{person['id']}/spend")).json()["projects"][0]
    assert row["expense_count"] == 2
    assert row["spent_amount"] == 37_500_00


async def test_somebody_who_has_spent_nothing_reports_no_projects(client: AsyncClient) -> None:
    await _setup(client)
    person = await _person(client, "Mum")

    assert (await client.get(f"/api/people/{person['id']}/spend")).json()["projects"] == []


async def test_a_removed_expense_stops_counting_against_the_person(client: AsyncClient) -> None:
    projects = await _setup(client)
    person = await _person(client, "Mum")
    expense = await _spend(client, projects["NGN"], person["id"], 37_500_00)

    await client.delete(f"/api/expenses/{expense['id']}")

    assert (await client.get(f"/api/people/{person['id']}/spend")).json()["projects"] == []
    assert (await client.get(f"/api/people/{person['id']}")).json()["expense_count"] == 0


async def test_somebody_can_be_edited(client: AsyncClient) -> None:
    await _setup(client)
    person = await _person(client, "Mum")

    resp = await client.patch(f"/api/people/{person['id']}", json={"role": "family"})
    assert resp.json()["role"] == "family"


async def test_an_edit_cannot_take_a_name_already_in_use(client: AsyncClient) -> None:
    await _setup(client)
    first = await _person(client, "Mr Idris")
    await _person(client, "Mum")

    assert (
        await client.patch(f"/api/people/{first['id']}", json={"name": "Mum"})
    ).status_code == 409


async def test_an_expense_cannot_name_somebody_who_is_not_there(client: AsyncClient) -> None:
    projects = await _setup(client)
    resp = await client.post(
        f"/api/projects/{projects['NGN']}/expenses",
        json={"description": "Cement", "amount": 100, "paid_by_id": "nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Person not found"


async def test_removing_somebody_leaves_the_expense_on_the_record(client: AsyncClient) -> None:
    projects = await _setup(client)
    person = await _person(client, "Mum")
    expense = await _spend(client, projects["NGN"], person["id"], 37_500_00)

    await client.delete(f"/api/people/{person['id']}")

    assert (await client.get(f"/api/expenses/{expense['id']}")).json()["amount"] == 37_500_00


async def test_a_person_who_is_not_there(client: AsyncClient) -> None:
    await _setup(client)
    assert (await client.get("/api/people/nope")).status_code == 404
    assert (await client.get("/api/people/nope/spend")).status_code == 404


async def test_the_people_list_carries_a_total_per_currency(client: AsyncClient) -> None:
    projects = await _setup(client, "NGN", "USD")
    person = await _person(client, "Mum")
    await _spend(client, projects["NGN"], person["id"], 20_000_00)
    await _spend(client, projects["NGN"], person["id"], 17_500_00)
    await _spend(client, projects["USD"], person["id"], 200_00)

    row = (await client.get("/api/people")).json()["items"][0]
    assert row["expense_count"] == 3
    by_code = {t["currency_code"]: t for t in row["totals"]}
    assert by_code["NGN"]["spent_amount"] == 37_500_00
    assert by_code["USD"]["spent_amount"] == 200_00


async def test_somebody_who_spent_nothing_has_no_totals(client: AsyncClient) -> None:
    await _setup(client)
    await _person(client, "Mum")

    row = (await client.get("/api/people")).json()["items"][0]
    assert row["totals"] == []
