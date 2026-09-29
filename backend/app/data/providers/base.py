from dataclasses import dataclass, field
from datetime import date
from typing import Protocol


class CompanyDataError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class RawCompanyData:
    provider: str
    profile: dict[str, str | None]
    income: dict[date, dict[str, float | None]]
    balance: dict[date, dict[str, float | None]]
    warnings: list[str] = field(default_factory=list)


class FinancialDataProvider(Protocol):
    def get_company_data(self, ticker: str) -> RawCompanyData: ...
