"""Integration tests for land, and for the project that is built on it."""

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.country import Country, State
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def _land(client: AsyncClient, name: str, **extra: object) -> dict:
    resp = await client.post("/api/lands", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _project(client: AsyncClient, name: str, **extra: object) -> dict:
    resp = await client.post("/api/projects", json={"name": name, "currency_code": "NGN", **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_land_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/lands")).status_code == 401


async def test_a_plot_is_kept_with_its_location_and_size(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(
        client,
        "Ewuru plot",
        address="Plot 14, Jacaranda Close",
        city="Ewuru",
        state="Ogun",
        size_value="648.50",
        size_unit="sqm",
    )

    assert land["city"] == "Ewuru"
    assert land["size_value"] == "648.5"
    assert land["size_unit"] == "sqm"
    assert land["document_count"] == 0


@pytest.mark.parametrize(
    ("sent", "shown"),
    [
        ("600", "600"),
        ("600.00", "600"),
        ("648.50", "648.5"),
        ("648.55", "648.55"),
        ("0.50", "0.5"),
        ("1", "1"),
        ("10000", "10000"),
    ],
)
async def test_a_round_size_is_not_shown_in_scientific_notation(
    client: AsyncClient, sent: str, shown: str
) -> None:
    await _setup(client)
    land = await _land(client, f"Plot of {sent}", size_value=sent, size_unit="sqm")
    assert land["size_value"] == shown

    again = await client.get(f"/api/lands/{land['id']}")
    assert again.json()["size_value"] == shown


async def test_a_size_without_its_unit_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    resp = await client.post("/api/lands", json={"name": "Nameless", "size_value": "500"})
    assert resp.status_code == 422
    assert "unit" in resp.text


async def test_a_unit_without_a_size_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    resp = await client.post("/api/lands", json={"name": "Nameless", "size_unit": "acre"})
    assert resp.status_code == 422


async def test_the_same_name_twice_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _land(client, "Ewuru plot")
    resp = await client.post("/api/lands", json={"name": "ewuru PLOT"})
    assert resp.status_code == 409


async def test_a_plot_says_which_papers_are_missing(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")
    assert land["missing_kinds"] == ["certificate_of_occupancy", "survey_plan", "deed"]


async def test_a_project_can_be_linked_to_land_as_it_is_created(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")

    project = await _project(client, "The house", land_id=land["id"])

    assert project["land_id"] == land["id"]
    assert project["land_name"] == "Ewuru plot"


async def test_a_project_can_be_linked_to_land_afterwards(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")
    project = await _project(client, "The house")
    assert project["land_id"] is None

    resp = await client.patch(f"/api/projects/{project['id']}", json={"land_id": land["id"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["land_name"] == "Ewuru plot"


async def test_a_project_can_be_unlinked_from_its_land(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")
    project = await _project(client, "The house", land_id=land["id"])

    resp = await client.patch(f"/api/projects/{project['id']}", json={"land_id": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["land_id"] is None
    assert resp.json()["land_name"] is None


async def test_linking_to_land_that_is_not_there_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    resp = await client.post(
        "/api/projects", json={"name": "The house", "currency_code": "NGN", "land_id": "nope"}
    )
    assert resp.status_code == 422
    assert "Unknown land" in resp.text


async def test_one_plot_carries_more_than_one_project(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")
    await _project(client, "The house", land_id=land["id"])
    await _project(client, "The boundary wall", land_id=land["id"])

    resp = await client.get(f"/api/lands/{land['id']}")
    names = [project["name"] for project in resp.json()["projects"]]
    assert names == ["The boundary wall", "The house"]


async def test_archiving_land_leaves_the_projects_standing(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")
    project = await _project(client, "The house", land_id=land["id"])

    assert (await client.delete(f"/api/lands/{land['id']}")).status_code == 204

    still_there = await client.get(f"/api/projects/{project['id']}")
    assert still_there.status_code == 200
    assert still_there.json()["land_id"] == land["id"]


async def test_archived_land_leaves_the_list_and_can_come_back(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot")

    await client.delete(f"/api/lands/{land['id']}")
    assert (await client.get("/api/lands")).json()["total"] == 0
    assert (await client.get("/api/lands?include_archived=true")).json()["total"] == 1

    resp = await client.post(f"/api/lands/{land['id']}/restore")
    assert resp.status_code == 200
    assert (await client.get("/api/lands")).json()["total"] == 1


async def test_land_is_found_by_its_city(client: AsyncClient) -> None:
    await _setup(client)
    await _land(client, "Ewuru plot", city="Ewuru", state="Ogun")

    resp = await client.get("/api/search", params={"q": "Ewuru"})
    kinds = {group["kind"]: group for group in resp.json()["groups"]}
    assert "lands" in kinds
    assert kinds["lands"]["hits"][0]["title"] == "Ewuru plot"


async def test_the_record_export_carries_land(client: AsyncClient) -> None:
    await _setup(client)
    await _land(client, "Ewuru plot")

    resp = await client.get("/api/install/export")
    assert resp.json()["row_counts"]["land"] == 1


async def test_a_restore_puts_the_land_back_under_its_project(client: AsyncClient) -> None:
    # Land has to be written before project, which references it. If the table
    # order in the dump were wrong this restore would fail on the foreign key.
    await _setup(client)
    land = await _land(client, "Ewuru plot", city="Ewuru")
    await _project(client, "The house", land_id=land["id"])
    backup = (await client.get("/api/install/export")).json()

    await client.delete(f"/api/lands/{land['id']}")

    resp = await client.post(
        "/api/install/restore", json={"backup": backup, "accept_version_change": False}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["row_counts"]["land"] == 1

    # A restore signs every device out, so sign back in before looking.
    await client.post("/api/auth/login", json={"password": "password123"})
    back = await client.get(f"/api/lands/{land['id']}")
    assert back.json()["deleted_at"] is None
    assert [project["name"] for project in back.json()["projects"]] == ["The house"]


async def _countries() -> None:
    await Country.bulk_create(
        [Country(code="NG", name="Nigeria"), Country(code="GH", name="Ghana")]
    )
    await State.bulk_create(
        [
            State(code="NG-LA", country_id="NG", name="Lagos"),
            State(code="NG-OG", country_id="NG", name="Ogun"),
            State(code="GH-AA", country_id="GH", name="Greater Accra"),
        ]
    )


async def test_a_plot_records_the_country_it_sits_in(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()

    land = await _land(client, "Ewuru plot", country_code="NG", state="Ogun")

    assert land["country_code"] == "NG"
    assert land["country_name"] == "Nigeria"
    assert land["state"] == "Ogun"


async def test_a_state_is_read_however_it_was_written(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()

    land = await _land(client, "Ewuru plot", country_code="NG", state="lagos")

    assert land["state"] == "Lagos"


async def test_a_state_can_be_given_by_its_code(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()

    land = await _land(client, "Ewuru plot", country_code="NG", state="NG-OG")

    assert land["state"] == "Ogun"


async def test_a_state_that_is_not_in_that_country_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()

    resp = await client.post(
        "/api/lands", json={"name": "Ewuru plot", "country_code": "NG", "state": "Greater Accra"}
    )

    assert resp.status_code == 422
    assert "Nigeria" in resp.json()["detail"]


async def test_a_country_that_is_not_there_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()

    resp = await client.post("/api/lands", json={"name": "Ewuru plot", "country_code": "ZZ"})

    assert resp.status_code == 422


async def test_a_plot_with_no_country_keeps_whatever_state_it_was_given(
    client: AsyncClient,
) -> None:
    await _setup(client)
    await _countries()

    land = await _land(client, "Ewuru plot", state="somewhere off the list")

    assert land["state"] == "somewhere off the list"
    assert land["country_code"] is None


async def test_an_older_plot_survives_an_edit_that_leaves_its_country_alone(
    client: AsyncClient,
) -> None:
    """A land saved before countries existed is never rejected for its free text state."""
    await _setup(client)
    await _countries()
    land = await _land(client, "Ewuru plot", state="lagos state")

    resp = await client.patch(f"/api/lands/{land['id']}", json={"name": "Ewuru plot two"})

    assert resp.status_code == 200
    assert resp.json()["state"] == "lagos state"


async def test_naming_a_country_starts_checking_the_state(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()
    land = await _land(client, "Ewuru plot", state="lagos state")

    resp = await client.patch(f"/api/lands/{land['id']}", json={"country_code": "NG"})

    assert resp.status_code == 422


async def test_a_state_is_checked_against_the_country_already_stored(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()
    land = await _land(client, "Ewuru plot", country_code="NG", state="Lagos")

    resp = await client.patch(f"/api/lands/{land['id']}", json={"state": "Greater Accra"})

    assert resp.status_code == 422


async def test_dropping_the_country_lets_the_state_be_anything_again(client: AsyncClient) -> None:
    await _setup(client)
    await _countries()
    land = await _land(client, "Ewuru plot", country_code="NG", state="Lagos")

    resp = await client.patch(
        f"/api/lands/{land['id']}", json={"country_code": None, "state": "off the list"}
    )

    assert resp.status_code == 200
    assert resp.json()["state"] == "off the list"


async def test_a_plot_remembers_when_it_was_bought(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(client, "Ewuru plot", purchased_on="2023-03-11")

    assert land["purchased_on"] == "2023-03-11"


async def test_a_restore_carries_the_country_and_the_price_history(client: AsyncClient) -> None:
    # Land now points at country, and land_valuation points at land and currency.
    # A wrong table order in the dump would fail on one of those foreign keys.
    await _setup(client)
    await _countries()
    land = await _land(client, "Ewuru plot", country_code="NG", state="Lagos")
    await client.post(
        f"/api/lands/{land['id']}/valuations",
        json={
            "kind": "purchase",
            "amount": 4500000,
            "currency_code": "NGN",
            "valued_on": "2023-03-11",
        },
    )
    backup = (await client.get("/api/install/export")).json()

    resp = await client.post(
        "/api/install/restore", json={"backup": backup, "accept_version_change": False}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["row_counts"]["land_valuation"] == 1

    await client.post("/api/auth/login", json={"password": "password123"})
    back = (await client.get(f"/api/lands/{land['id']}")).json()
    assert back["country_name"] == "Nigeria"
    assert back["state"] == "Lagos"
    assert back["purchase_amount"] == 4500000
    assert back["currency_code"] == "NGN"


SQUARE = [[3.3, 6.5], [3.3009, 6.5], [3.3009, 6.5009], [3.3, 6.5009], [3.3, 6.5]]


async def test_a_plot_remembers_where_it_is(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(client, "Ewuru plot", latitude="6.5244", longitude="3.3792")

    assert land["latitude"] == "6.5244"
    assert land["longitude"] == "3.3792"


async def test_half_a_coordinate_is_refused(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.post("/api/lands", json={"name": "Nameless", "latitude": "6.5"})

    assert resp.status_code == 422
    assert "longitude" in resp.text


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [("91", "3.3"), ("-91", "3.3"), ("6.5", "181"), ("6.5", "-181")],
)
async def test_a_coordinate_off_the_earth_is_refused(
    client: AsyncClient, latitude: str, longitude: str
) -> None:
    await _setup(client)

    resp = await client.post(
        "/api/lands",
        json={"name": "Nameless", "latitude": latitude, "longitude": longitude},
    )

    assert resp.status_code == 422


async def test_a_plot_keeps_the_shape_of_its_edge(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(client, "Ewuru plot", boundary={"type": "Polygon", "coordinates": [SQUARE]})

    assert land["boundary"]["type"] == "Polygon"
    assert land["boundary"]["coordinates"][0][0] == [3.3, 6.5]
    assert land["boundary_area_sqm"] == pytest.approx(10_000, rel=0.01)


async def test_an_edge_that_was_left_open_comes_back_closed(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(
        client, "Ewuru plot", boundary={"type": "Polygon", "coordinates": [SQUARE[:-1]]}
    )

    ring = land["boundary"]["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) == 5


async def test_a_line_is_not_an_edge(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.post(
        "/api/lands",
        json={
            "name": "Nameless",
            "boundary": {"type": "Polygon", "coordinates": [[[3.3, 6.5], [3.4, 6.6]]]},
        },
    )

    assert resp.status_code == 422


async def test_a_pasted_county_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    huge = [[3.3 + i / 100000, 6.5] for i in range(1001)]

    resp = await client.post(
        "/api/lands",
        json={"name": "Nameless", "boundary": {"type": "Polygon", "coordinates": [huge]}},
    )

    assert resp.status_code == 422


async def test_a_plot_with_no_edge_reports_no_area(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(client, "Ewuru plot")

    assert land["boundary"] is None
    assert land["boundary_area_sqm"] is None


async def test_the_edge_can_be_redrawn_and_cleared(client: AsyncClient) -> None:
    await _setup(client)
    land = await _land(client, "Ewuru plot", boundary={"type": "Polygon", "coordinates": [SQUARE]})

    resp = await client.patch(f"/api/lands/{land['id']}", json={"boundary": None})

    assert resp.status_code == 200
    assert resp.json()["boundary"] is None
    assert resp.json()["boundary_area_sqm"] is None


async def test_a_plot_keeps_what_the_map_calls_the_spot(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(
        client,
        "Ewuru plot",
        address="The farm past the church",
        geocoded_address="14 Jacaranda Close, Ewuru, Ogun, Nigeria",
    )

    assert land["address"] == "The farm past the church"
    assert land["geocoded_address"] == "14 Jacaranda Close, Ewuru, Ogun, Nigeria"


async def test_a_plot_with_no_pin_has_nothing_the_map_calls_it(client: AsyncClient) -> None:
    await _setup(client)

    land = await _land(client, "Ewuru plot")

    assert land["geocoded_address"] is None
