import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest.mark.parametrize("resource", ["people", "items", "vendors", "lands"])
async def test_restore_rejects_active_duplicate(client: AsyncClient, resource: str) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    url = f"/api/{resource}"
    first = await client.post(url, json={"name": "Initial"})
    assert first.status_code == 201
    record = f"{url}/{first.json()['id']}"
    assert (await client.post(f"{record}/archive")).status_code == 204
    assert (await client.post(url, json={"name": "INITIAL"})).status_code == 201
    assert (await client.post(f"{record}/restore")).status_code == 409
