import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "BSP" in data["app_name"] or "Bank Statement" in data["app_name"]

@pytest.mark.asyncio
async def test_templates_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/templates")
    assert response.status_code == 200
    templates = response.json()
    assert len(templates) >= 7
    bank_codes = [t["bank_code"] for t in templates]
    assert "MBB" in bank_codes
    assert "VPB" in bank_codes
    assert "TPB" in bank_codes

