from copy import deepcopy
from time import perf_counter

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.model import ModelCalculateRequest
from app.financial import run_lbo_model, TransactionAssumptions
from app.financial.sensitivity import run_sensitivity_analysis
from test_model_api import payload


def inputs(payload):
    p = ModelCalculateRequest.model_validate(payload)
    return p.historical, p.transaction_assumptions, p.operating_assumptions


def test_every_cell_matches_complete_standalone_engine(payload, monkeypatch):
    import app.financial.sensitivity as module
    h, t, o = inputs(payload)
    before = deepcopy((h, t, o))
    calls = []
    def tracked(*args):
        calls.append(args)
        return run_lbo_model(*args)
    monkeypatch.setattr(module, "run_lbo_model", tracked)
    started = perf_counter()
    result = run_sensitivity_analysis(h, t, o)
    print(f"Default sensitivity elapsed: {perf_counter() - started:.6f}s")
    assert len(calls) == 25
    assert result.entry_multiples == result.exit_multiples == (8, 9, 10, 11, 12)
    assert len(result.matrix) == 5
    for r, entry in enumerate(result.entry_multiples):
        assert len(result.matrix[r]) == 5
        for c, exit_ in enumerate(result.exit_multiples):
            cell = result.matrix[r][c]
            tx = TransactionAssumptions.model_validate({**t.model_dump(), "purchase_multiple_ev_ebitda": entry, "exit_multiple": exit_})
            expected = run_lbo_model(h, tx, o)
            assert (cell.entry_multiple, cell.exit_multiple) == (entry, exit_)
            assert cell.irr == expected.returns.irr
            assert cell.moic == expected.returns.moic
            assert cell.exit_equity == expected.returns.exit_equity
            assert cell.ending_debt == expected.returns.exit_debt
    assert (h, t, o) == before
    assert result.base_case.row_index == result.base_case.column_index == 2
    assert result.matrix[2][2].irr == pytest.approx(0.1977441934779717)
    assert result.matrix[2][2].moic == pytest.approx(2.465019564934513)


def test_custom_order_and_current_base_case(payload):
    payload["transaction_assumptions"].update(purchase_multiple_ev_ebitda=9.5, exit_multiple=11)
    h, t, o = inputs(payload)
    result = run_sensitivity_analysis(h, t, o, [12, 9.5], [11, 8, 10])
    assert result.entry_multiples == (12, 9.5)
    assert result.exit_multiples == (11, 8, 10)
    assert (result.base_case.row_index, result.base_case.column_index) == (1, 0)
    absent = run_sensitivity_analysis(h, t, o)
    assert absent.base_case.entry_multiple == 9.5
    assert absent.base_case.row_index is None
    assert absent.base_case.column_index is None
    assert any("no base cell" in w for w in absent.warnings)


@pytest.mark.parametrize("grid", [[], [0], [-1], [float("nan")], [float("inf")], list(range(1, 12))])
@pytest.mark.parametrize("axis", ["entry_multiples", "exit_multiples"])
def test_python_grid_validation(payload, grid, axis):
    with pytest.raises(ValidationError):
        run_sensitivity_analysis(*inputs(payload), **{axis: grid})


def test_null_irr_and_http_contract(payload):
    client = TestClient(app)
    response = client.post("/api/v1/model/sensitivity", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["matrix"]) == 5
    assert sum(map(len, body["matrix"])) == 25
    assert "NaN" not in response.text and "Infinity" not in response.text
    assert body["matrix"][2][2]["irr"] == pytest.approx(0.1977441934779717)
    payload["operating_assumptions"]["ebitda_margin"] = 0
    response = client.post("/api/v1/model/sensitivity", json=payload)
    assert response.status_code == 200
    assert all(c["irr"] is None for row in response.json()["matrix"] for c in row)


@pytest.mark.parametrize("grid", [[], [0], [-1], list(range(1, 12))])
def test_http_invalid_grid(payload, grid):
    assert TestClient(app).post("/api/v1/model/sensitivity", json={**payload, "entry_multiples": grid}).status_code == 422


def test_http_domain_failure(payload):
    payload["historical"]["ebitda"] = 0
    assert TestClient(app).post("/api/v1/model/sensitivity", json=payload).status_code == 400


def test_maximum_grid(payload):
    result = run_sensitivity_analysis(*inputs(payload), range(1, 11), range(1, 11))
    assert sum(map(len, result.matrix)) == 100
