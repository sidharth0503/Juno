from collections import OrderedDict
import re
from threading import Lock
from time import monotonic

from app.data.models import CompanyResponse
from app.data.normalization import normalize
from app.data.providers.base import CompanyDataError, FinancialDataProvider


def normalize_ticker(ticker: str) -> str:
    ticker = ticker.strip().upper()
    if not re.fullmatch(r"[A-Z0-9^][A-Z0-9.\-^=]{0,31}", ticker):
        raise CompanyDataError("Enter a valid ticker (letters, numbers, '.', '-', '^' or '=').", 422)
    return ticker


class CompanyService:
    def __init__(self, provider: FinancialDataProvider, ttl: float = 1800, capacity: int = 64, clock=monotonic):
        self.provider, self.ttl, self.capacity, self.clock = provider, ttl, capacity, clock
        self._cache: OrderedDict[str, tuple[float, CompanyResponse]] = OrderedDict()
        self._lock = Lock()

    def get_company(self, ticker: str) -> CompanyResponse:
        ticker = normalize_ticker(ticker)
        with self._lock:
            cached = self._cache.get(ticker)
            if cached and cached[0] > self.clock():
                self._cache.move_to_end(ticker)
                return cached[1].model_copy(deep=True)
        result = normalize(ticker, self.provider.get_company_data(ticker))
        with self._lock:
            self._cache[ticker] = (self.clock() + self.ttl, result.model_copy(deep=True))
            self._cache.move_to_end(ticker)
            while len(self._cache) > self.capacity:
                self._cache.popitem(last=False)
        return result


def _build_service() -> CompanyService:
    from app.data.providers.yfinance_provider import YFinanceProvider
    return CompanyService(YFinanceProvider())


_service = _build_service()


def get_company_service() -> CompanyService:
    return _service
