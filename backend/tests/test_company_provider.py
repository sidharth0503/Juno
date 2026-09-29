"""Adapter tests use fake yfinance objects; no network requests are made."""
from datetime import datetime
from types import SimpleNamespace
from time import monotonic

import pytest

from app.data.providers import yfinance_provider as adapter
from app.data.providers.base import CompanyDataError


class Frame:
    columns = [datetime(2025, 9, 30)]

    def __getitem__(self, column):
        return {"TotalRevenue": 1e9, "Inventory": float("nan")}


class Stock:
    def get_info(self):
        return {"longName": "Example", "currency": "USD", "financialCurrency": "EUR"}

    def get_income_stmt(self, **kwargs):
        assert kwargs == {"freq": "yearly", "pretty": False}
        return Frame()

    get_balance_sheet = get_income_stmt


def test_adapter_annual_plain_values_and_statement_currency(monkeypatch):
    monkeypatch.setattr(adapter.yf, "Ticker", lambda *a, **k: Stock())
    raw = adapter.YFinanceProvider().get_company_data("FIX")
    assert raw.profile["currency"] == "EUR"
    assert raw.income[datetime(2025, 9, 30).date()] == {"TotalRevenue": 1e9, "Inventory": None}


def test_adapter_partial_preserved(monkeypatch):
    class Partial(Stock):
        def get_info(self):
            raise TimeoutError()

        def get_balance_sheet(self, **kwargs):
            raise TimeoutError()
    monkeypatch.setattr(adapter.yf, "Ticker", lambda *a, **k: Partial())
    raw = adapter.YFinanceProvider().get_company_data("FIX")
    assert raw.income
    assert not raw.balance
    assert raw.profile["currency"] is None
    assert len(raw.warnings) == 2


@pytest.mark.parametrize("http_status,transport_failed,expected", [(404, False, 404), (429, False, 502), (503, False, 502), (404, True, 502)])
def test_adapter_resolution_failures(monkeypatch, http_status, transport_failed, expected):
    class Failed(Stock):
        def get_info(self):
            raise ConnectionError()

        def get_income_stmt(self, **kwargs):
            raise ConnectionError()

        get_balance_sheet = get_income_stmt

    def ticker(*args, session):
        session.statuses = [http_status]
        session.transport_failed = transport_failed
        return Failed()
    monkeypatch.setattr(adapter.yf, "Ticker", ticker)
    with pytest.raises(CompanyDataError) as exc:
        adapter.YFinanceProvider().get_company_data("FIX")
    assert exc.value.status == expected


def test_provider_busy_and_unexpected_errors_are_safe(monkeypatch):
    provider = adapter.YFinanceProvider()
    with provider._lock:
        with pytest.raises(CompanyDataError) as exc:
            provider.get_company_data("FIX")
        assert exc.value.status == 503
    def fail(*args):
        raise RuntimeError("private implementation detail")
    monkeypatch.setattr(provider, "_fetch", fail)
    with pytest.raises(CompanyDataError) as exc:
        provider.get_company_data("FIX")
    assert exc.value.status == 502
    assert "private" not in str(exc.value)


def test_http_budget_caps_calls_and_prevents_expired_network(monkeypatch):
    calls = []
    def request(self, method, url, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status_code=200)
    monkeypatch.setattr(adapter.Session, "request", request)
    with adapter.BoundedSession() as session:
        session.statuses = []
        session.deadline = monotonic() + 40
        session.request("GET", "https://fixture", timeout=30)
        assert calls[-1]["timeout"] == 8
        session.deadline = monotonic() + 2
        session.request("GET", "https://fixture")
        assert 0 < calls[-1]["timeout"] <= 2
        session.deadline = 0
        with pytest.raises(TimeoutError):
            session.request("GET", "https://fixture")
        assert len(calls) == 2
