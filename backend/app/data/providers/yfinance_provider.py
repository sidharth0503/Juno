"""All yfinance and DataFrame handling is confined to this adapter."""
import logging
import math
from pathlib import Path
from tempfile import gettempdir
from threading import Lock
from time import monotonic

import yfinance as yf
from curl_cffi.requests import Session

from app.data.providers.base import CompanyDataError, RawCompanyData

logger = logging.getLogger(__name__)

# Configure before the first ticker fetch. yfinance's public setter relocates its
# cookie, timezone and ISIN caches together; Vercel's writable storage is /tmp.
yf.set_tz_cache_location(str(Path(gettempdir()) / "lbo-yfinance"))


class BoundedSession(Session):
    """Cap each HTTP request and the cumulative request budget (no added retries)."""
    deadline = 0.0

    def request(self, method, url, **kwargs):
        remaining = self.deadline - monotonic()
        if remaining <= 0:
            self.transport_failed = True
            raise TimeoutError("Company provider request budget exhausted")
        kwargs["timeout"] = min(8.0, remaining)
        try:
            response = super().request(method, url, **kwargs)
        except Exception:
            self.transport_failed = True
            raise
        self.statuses.append(response.status_code)
        return response


class YFinanceProvider:
    # yfinance shares its HTTP session internally. Serialize this adapter's calls.
    _lock = Lock()

    def get_company_data(self, ticker: str) -> RawCompanyData:
        if not self._lock.acquire(blocking=False):
            raise CompanyDataError("Market data service is busy. Please retry shortly.", 503)
        try:
            return self._fetch(ticker)
        except CompanyDataError:
            raise
        except Exception as exc:
            logger.exception("Unexpected company provider failure for %s", ticker)
            raise CompanyDataError("Market data service unavailable. Please retry.", 502) from exc
        finally:
            self._lock.release()

    def _fetch(self, ticker: str) -> RawCompanyData:
        yf.config.debug.hide_exceptions = False
        with BoundedSession(impersonate="chrome") as session:
            session.deadline = monotonic() + 40
            session.statuses = []
            session.transport_failed = False
            stock = yf.Ticker(ticker, session=session)
            warnings, failures = [], []
            info = {}
            try:
                info = stock.get_info() or {}
            except Exception as exc:
                logger.warning("Company metadata fetch failed for %s: %s", ticker, type(exc).__name__)
                failures.append(exc)
                warnings.append("Company metadata could not be fully retrieved from the provider.")
            statements = {}
            for name, getter in (("income", stock.get_income_stmt), ("balance", stock.get_balance_sheet)):
                try:
                    frame = getter(freq="yearly", pretty=False)
                    statements[name] = {
                        column.date(): {str(row): float(value) if value is not None and math.isfinite(float(value)) else None
                                        for row, value in frame[column].items()}
                        for column in frame.columns
                    }
                except Exception as exc:
                    logger.warning("Annual %s fetch failed for %s: %s", name, ticker, type(exc).__name__)
                    failures.append(exc)
                    statements[name] = {}
                    warnings.append(f"Annual {name} statement unavailable from provider; data may be partial.")
            resolved = bool(info.get("longName") or info.get("shortName") or any(statements.values()))
            if not resolved:
                if 404 in session.statuses and not session.transport_failed and not any(s >= 500 or s == 429 for s in session.statuses):
                    raise CompanyDataError("Ticker not found by the data provider.", 404)
                raise CompanyDataError("Market data service unavailable or ticker could not be resolved. Please retry.", 502)
            if not any(statements.values()) and failures:
                raise CompanyDataError("Market data service could not retrieve annual statements. Please retry.", 502)
            def text(key):
                value = info.get(key)
                return value if isinstance(value, str) and value.strip() else None
            return RawCompanyData(provider="yfinance", profile={
                "company_name": text("longName") or text("shortName"),
                "exchange": text("fullExchangeName") or text("exchange"),
                # Trading currency is not necessarily the statement currency.
                "currency": text("financialCurrency"), "sector": text("sector"), "industry": text("industry"),
            }, income=statements["income"], balance=statements["balance"], warnings=warnings)
