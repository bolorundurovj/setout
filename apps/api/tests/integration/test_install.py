import pytest
from httpx import AsyncClient

from setout import __version__
from setout.currencies import CURRENCIES
from setout.models.currency import Currency
from setout.utils.dump import FORMAT

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _signed_in(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def _project(client: AsyncClient, name: str = "Jacaranda Close, Ewuru") -> dict:
    resp = await client.post("/api/projects", json={"name": name, "currency_code": "NGN"})
    return resp.json()


async def _export(client: AsyncClient) -> dict:
    resp = await client.get("/api/install/export")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _restore(client: AsyncClient, backup: dict, accept: bool = False) -> object:
    return await client.post(
        "/api/install/restore",
        json={"backup": backup, "accept_version_change": accept},
    )


async def test_the_install_facts_need_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/install")).status_code == 401


async def test_an_export_needs_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/install/export")).status_code == 401


async def test_a_restore_needs_authentication(client: AsyncClient) -> None:
    assert (await client.post("/api/install/restore", json={"backup": {}})).status_code == 401


async def test_the_install_says_its_version_and_its_schema(client: AsyncClient) -> None:
    await _signed_in(client)

    facts = (await client.get("/api/install")).json()

    assert facts["version"] == __version__
    assert facts["record_bytes"] >= 0
    assert "migration" in facts
    assert "record_changed_at" in facts


async def test_an_export_is_stamped_with_what_wrote_it(client: AsyncClient) -> None:
    await _signed_in(client)

    backup = await _export(client)

    assert backup["format"] == FORMAT
    assert backup["app_version"] == __version__
    assert backup["exported_at"]
    assert backup["row_counts"]["user"] == 1


async def test_an_export_carries_every_row(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client)

    backup = await _export(client)

    assert [p["name"] for p in backup["tables"]["project"]] == ["Jacaranda Close, Ewuru"]
    assert backup["row_counts"]["project"] == 1
    assert backup["tables"]["currency"]


async def test_sessions_are_left_out_of_an_export(client: AsyncClient) -> None:
    await _signed_in(client)

    backup = await _export(client)

    assert "session" not in backup["tables"]


async def test_a_restore_puts_the_record_back_as_it_was(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client)
    backup = await _export(client)

    await _project(client, name="Added after the copy")
    assert (await client.get("/api/projects")).json()["total"] == 2

    resp = await _restore(client, backup)

    assert resp.status_code == 200, resp.text
    assert resp.json()["row_counts"]["project"] == 1
    assert resp.json()["signed_out"] is True


async def test_the_passphrase_from_the_copy_is_the_one_that_works_after(
    client: AsyncClient,
) -> None:
    await _signed_in(client)
    backup = await _export(client)
    await client.post(
        "/api/auth/password",
        json={"current_password": "password123", "new_password": "a longer secret"},
    )

    await _restore(client, backup)

    await client.post("/api/auth/logout")
    back = await client.post("/api/auth/login", json={"password": "password123"})
    assert back.status_code == 200


async def test_a_restore_signs_every_device_out(client: AsyncClient) -> None:
    await _signed_in(client)
    backup = await _export(client)

    await _restore(client, backup)

    assert (await client.get("/api/auth/me")).status_code == 401


async def test_a_copy_from_another_version_is_refused_until_it_is_accepted(
    client: AsyncClient,
) -> None:
    await _signed_in(client)
    backup = await _export(client)
    backup["app_version"] = "0.0.1"

    refused = await _restore(client, backup)
    assert refused.status_code == 409
    assert "0.0.1" in refused.json()["detail"]
    assert "may fail if the schema has changed" in refused.json()["detail"]

    accepted = await _restore(client, backup, accept=True)
    assert accepted.status_code == 200


async def test_a_copy_from_another_schema_is_refused_the_same_way(client: AsyncClient) -> None:
    await _signed_in(client)
    backup = await _export(client)
    backup["migration"] = "0099_from_the_future"

    refused = await _restore(client, backup)

    assert refused.status_code == 409
    assert "0099_from_the_future" in refused.json()["detail"]


async def test_a_file_of_another_layout_is_refused(client: AsyncClient) -> None:
    await _signed_in(client)
    backup = await _export(client)
    backup["format"] = 99

    resp = await _restore(client, backup, accept=True)

    assert resp.status_code == 422
    assert "layout 99" in resp.json()["detail"]


async def test_a_file_naming_a_table_this_setout_does_not_know_is_refused(
    client: AsyncClient,
) -> None:
    await _signed_in(client)
    backup = await _export(client)
    backup["tables"]["deliveries"] = []

    resp = await _restore(client, backup, accept=True)

    assert resp.status_code == 422
    assert "deliveries" in resp.json()["detail"]


async def test_rows_that_do_not_fit_leave_the_record_alone(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client)
    backup = await _export(client)
    backup["tables"]["project"][0]["nonsense_column"] = "x"

    resp = await _restore(client, backup, accept=True)

    assert resp.status_code == 422
    assert "left as it was" in resp.json()["detail"]
    assert (await client.get("/api/projects")).json()["total"] == 1


async def test_a_copy_naming_a_column_the_table_lacks_is_refused(client: AsyncClient) -> None:
    await _signed_in(client)
    copy = (await client.get("/api/install/export")).json()
    copy["tables"]["vendor"] = [
        {"id": "v1", "name": "A vendor", 'sneaky") ; DROP TABLE vendor; --': "x"}
    ]

    resp = await client.post("/api/install/restore", json={"backup": copy})

    assert resp.status_code == 422
    assert "no column" in resp.json()["detail"]
    assert (await client.get("/api/vendors")).status_code == 200
