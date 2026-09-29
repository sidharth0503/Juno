from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


class FieldSource(BaseModel):
    status: Literal["reported", "derived", "missing"]
    source: str | None = None


class HistoricalPeriod(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    fiscal_year: int
    period_end: date
    revenue: float | None = None
    cogs: float | None = None
    ebitda: float | None = None
    cash: float | None = None
    accounts_receivable: float | None = None
    inventory: float | None = None
    accounts_payable: float | None = None
    ppe: float | None = None
    debt: float | None = None
    shareholders_equity: float | None = None
    provenance: dict[str, FieldSource]


class CompanyProfile(BaseModel):
    ticker: str
    company_name: str | None = None
    exchange: str | None = None
    currency: str | None = None
    sector: str | None = None
    industry: str | None = None
    latest_fiscal_period: date | None = None
    provider: str


class CompanyResponse(BaseModel):
    company: CompanyProfile
    historical_periods: list[HistoricalPeriod]
    base_year: HistoricalPeriod
    warnings: list[str]
    units: Literal["millions"] = "millions"
