import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def payload():
    return {
        "historical": {
            "revenue": 1000, "cogs": 600, "ebitda": 300, "cash": 50,
            "accounts_receivable": 100, "inventory": 80, "accounts_payable": 60,
            "ppe": 500, "debt": 200, "shareholders_equity": 470,
        },
        "transaction_assumptions": {
            "purchase_multiple_ev_ebitda": 10, "debt_percentage": 0.7,
            "interest_rate": 0.08, "exit_multiple": 10,
        },
        "operating_assumptions": {
            "revenue_growth_rate": 0.05, "ebitda_margin": 0.3, "tax_rate": 0.25,
            "dso_days": 45, "dio_days": 60, "dpo_days": 30, "capex_pct_of_rev": 0.04,
        },
    }


def test_calculate_contract(payload):
    with TestClient(app) as client:
        response = client.post("/api/v1/model/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"transaction", "historical", "historical_cogs_ratio", "projected_years", "returns", "diagnostics"}
    assert len(data["projected_years"]) == 5
    assert data["transaction"]["initial_debt"] == pytest.approx(2100)
    assert data["returns"]["irr"] == pytest.approx(0.1977441934779717)
    assert data["projected_years"][0]["balance_check"] == pytest.approx(-1900)
    assert data["diagnostics"][0]["code"] == "simplified_balance_sheet_imbalance"


def test_validation_error(payload):
    payload["transaction_assumptions"]["debt_percentage"] = 70
    with TestClient(app) as client:
        response = client.post("/api/v1/model/calculate", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "debt_percentage"


def test_domain_error(payload):
    payload["historical"]["ebitda"] = 0
    with TestClient(app) as client:
        response = client.post("/api/v1/model/calculate", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "financial_model_error"


def test_null_irr_is_serializable(payload):
    payload["operating_assumptions"]["ebitda_margin"] = 0
    with TestClient(app) as client:
        response = client.post("/api/v1/model/calculate", json=payload)
    assert response.status_code == 200
    assert response.json()["returns"]["irr"] is None


def test_browser_post_preflight():
    with TestClient(app) as client:
        response = client.options("/api/v1/model/calculate", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
