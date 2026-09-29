from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_local_frontend_cors():
    with TestClient(app) as client:
        response = client.get(
            "/health", headers={"Origin": "http://localhost:3000"}
        )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
