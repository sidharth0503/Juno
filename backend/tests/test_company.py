from datetime import date

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.data.normalization import FIELD_MAPPINGS, normalize
from app.data.providers.base import CompanyDataError, RawCompanyData
from app.services.company_service import CompanyService, get_company_service, normalize_ticker


@pytest.fixture
def raw():
    end = date(2025, 9, 30)
    return RawCompanyData("fake", {"company_name": "Fixture Corp", "currency": "EUR"},
        {end: {"Total Revenue": 1_000_000_000, "Cost Of Revenue": 600_000_000, "EBITDA": 300_000_000}},
        {end: {"Cash And Cash Equivalents": 50_000_000, "Accounts Receivable": 100_000_000,
               "Inventory": 0, "Accounts Payable": 60_000_000, "Net PPE": 500_000_000,
               "Total Debt": 200_000_000, "Stockholders Equity": 470_000_000}})


def test_all_fields_and_scale(raw):
    result = normalize("FIX", raw)
    expected = dict(revenue=1000, cogs=600, ebitda=300, cash=50, accounts_receivable=100,
                    inventory=0, accounts_payable=60, ppe=500, debt=200, shareholders_equity=470)
    assert {f: getattr(result.base_year, f) for f in expected} == expected
    assert all(p.status == "reported" for p in result.base_year.provenance.values())
    assert result.units == "millions"
    assert result.company.currency == "EUR"


@pytest.mark.parametrize("field", FIELD_MAPPINGS)
def test_native_camelcase_labels(raw, field):
    statement, candidates = FIELD_MAPPINGS[field]
    rows = next(iter(getattr(raw, statement).values()))
    rows.clear()
    rows[candidates[0]] = 12_500_000
    assert getattr(normalize("FIX", raw).base_year, field) == 12.5


@pytest.mark.parametrize("field,label", [("cogs", "Cost Of Revenue"), ("ebitda", "EBITDA"),
    ("inventory", "Inventory"), ("debt", "Total Debt")])
def test_missing_required_fields(raw, field, label):
    statement = FIELD_MAPPINGS[field][0]
    next(iter(getattr(raw, statement).values())).pop(label)
    result = normalize("FIX", raw)
    assert getattr(result.base_year, field) is None
    assert result.base_year.provenance[field].status == "missing"
    assert any(field.upper() in w and "manual input required" in w for w in result.warnings)
    assert result.base_year.revenue == 1000


def test_missing_metadata(raw):
    raw.profile = {}
    result = normalize("FIX", raw)
    assert result.company.company_name is None
    assert result.company.currency is None
    assert result.company.exchange is None
    assert any("currency unavailable" in w for w in result.warnings)


def test_mapping_priority_and_safe_alternatives(raw):
    income = next(iter(raw.income.values()))
    balance = next(iter(raw.balance.values()))
    income["OperatingRevenue"] = 999
    balance.update({"GrossPPE": 999, "TotalLiabilitiesNetMinorityInterest": 999,
                    "CashCashEquivalentsAndShortTermInvestments": 99_000_000})
    result = normalize("FIX", raw)
    assert result.base_year.cash == 50
    assert result.base_year.ppe == 500
    assert result.base_year.debt == 200
    assert any("mapping priority" in w for w in result.warnings)
    balance.pop("Cash And Cash Equivalents")
    balance.pop("Total Debt")
    balance.pop("Net PPE")
    result = normalize("FIX", raw)
    assert result.base_year.cash == 99
    assert result.base_year.debt is None
    assert result.base_year.ppe is None
    assert any("short-term investments" in w for w in result.warnings)


def test_alternative_rows(raw):
    raw.income = {date(2025, 1, 1): {"OperatingRevenue": 9e6, "CostOfGoodsSold": 4e6}}
    raw.balance = {date(2025, 1, 1): {"NetReceivables": 2e6, "CommonStockEquity": 3e6}}
    p = normalize("FIX", raw).base_year
    assert (p.revenue, p.cogs, p.accounts_receivable, p.shareholders_equity) == (9, 4, 2, 3)
    assert p.ebitda is None


def test_latest_three_sorted_and_empty_column_ignored(raw):
    raw.income = {date(y, 9, 30): {"TotalRevenue": y * 1e6} for y in [2025, 2022, 2024, 2023]}
    raw.income[date(2026, 9, 30)] = {"TotalRevenue": float("nan")}
    result = normalize("FIX", raw)
    assert [p.fiscal_year for p in result.historical_periods] == [2023, 2024, 2025]
    assert result.base_year == result.historical_periods[-1]
    assert result.base_year.revenue == 2025


def test_nan_not_zero(raw):
    next(iter(raw.balance.values()))["Inventory"] = float("nan")
    assert normalize("FIX", raw).base_year.inventory is None


class FakeProvider:
    def __init__(self, raw=None, error=None):
        self.raw, self.error, self.calls = raw, error, 0

    def get_company_data(self, ticker):
        self.calls += 1
        if self.error:
            raise self.error
        return self.raw


def test_cache_ttl_capacity_and_copy(raw):
    clock = [0]
    provider = FakeProvider(raw)
    service = CompanyService(provider, ttl=10, capacity=1, clock=lambda: clock[0])
    first = service.get_company(" fix ")
    first.warnings.clear()
    assert service.get_company("FIX").warnings
    assert provider.calls == 1
    clock[0] = 11
    service.get_company("FIX")
    service.get_company("SECOND")
    service.get_company("FIX")
    assert provider.calls == 4


@pytest.mark.parametrize("ticker,expected", [(" aapl ", "AAPL"), ("brk-b", "BRK-B"),
    ("7203.t", "7203.T"), ("reliance.ns", "RELIANCE.NS"), ("^gspc", "^GSPC")])
def test_ticker_normalization(ticker, expected):
    assert normalize_ticker(ticker) == expected


@pytest.mark.parametrize("ticker", ["", " ", "../", "hello world", "A" * 33])
def test_invalid_ticker(ticker):
    with pytest.raises(CompanyDataError) as exc:
        normalize_ticker(ticker)
    assert exc.value.status == 422


@pytest.mark.parametrize("status", [404, 502, 503])
def test_api_provider_errors(status):
    app.dependency_overrides[get_company_service] = lambda: CompanyService(FakeProvider(error=CompanyDataError("Safe error", status)))
    try:
        response = TestClient(app).get("/api/v1/company/BAD")
        assert response.status_code == status
        assert response.json() == {"detail": {"message": "Safe error"}}
    finally:
        app.dependency_overrides.clear()


def test_api_partial_data(raw):
    raw.balance = {}
    app.dependency_overrides[get_company_service] = lambda: CompanyService(FakeProvider(raw))
    try:
        response = TestClient(app).get("/api/v1/company/%20fix%20")
        assert response.status_code == 200
        body = response.json()
        assert body["company"]["ticker"] == "FIX"
        assert body["base_year"]["cash"] is None
        assert body["base_year"]["revenue"] == 1000
        assert body["warnings"]
    finally:
        app.dependency_overrides.clear()


def test_unsupported_statements():
    with pytest.raises(CompanyDataError) as exc:
        normalize("FIX", RawCompanyData("fake", {}, {}, {}))
    assert exc.value.status == 422
