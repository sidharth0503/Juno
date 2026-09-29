"""Immutable, finite-valued inputs and outputs for the five-year LBO model."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PROJECTION_YEARS = 5


class FinancialSchema(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)


class HistoricalFinancials(FinancialSchema):
    """Year 0 amounts. COGS is a positive expense; cash/equity may be negative."""

    revenue: float = Field(gt=0)
    cogs: float = Field(ge=0)
    ebitda: float
    cash: float
    accounts_receivable: float
    inventory: float
    accounts_payable: float
    ppe: float = Field(ge=0)
    debt: float
    shareholders_equity: float


class TransactionAssumptions(FinancialSchema):
    purchase_multiple_ev_ebitda: float = Field(gt=0)
    debt_percentage: float = Field(ge=0, lt=1)
    interest_rate: float = Field(ge=0)
    exit_multiple: float = Field(gt=0)


class OperatingAssumptions(FinancialSchema):
    revenue_growth_rate: float = Field(gt=-1)
    ebitda_margin: float = Field(ge=0, le=1)
    tax_rate: float = Field(ge=0, le=1)
    dso_days: float = Field(ge=0)
    dio_days: float = Field(ge=0)
    dpo_days: float = Field(ge=0)
    capex_pct_of_rev: float = Field(ge=0)


class TransactionSummary(FinancialSchema):
    purchase_enterprise_value: float
    initial_debt: float = Field(ge=0)
    initial_equity: float = Field(gt=0)


class YearProjection(FinancialSchema):
    year: int = Field(ge=1, le=PROJECTION_YEARS)
    beginning_revenue: float
    revenue: float
    cogs: float
    ebitda: float
    beginning_ppe: float
    capex: float
    depreciation: float
    ending_ppe: float
    ebit: float
    beginning_debt: float
    interest_expense: float
    ebt: float
    taxes: float
    net_income: float
    accounts_receivable: float
    inventory: float
    accounts_payable: float
    prior_nwc: float
    nwc: float
    change_in_nwc: float
    cfads: float
    mandatory_debt_paydown: float
    optional_debt_paydown: float
    ending_debt: float = Field(ge=0)
    beginning_cash: float
    retained_cash_flow: float
    ending_cash: float
    beginning_equity: float
    ending_equity: float
    total_assets: float
    total_liabilities: float
    balance_check: float


class ReturnsSummary(FinancialSchema):
    exit_enterprise_value: float
    exit_debt: float
    exit_equity: float
    moic: float
    irr: float | None


class ModelDiagnostic(FinancialSchema):
    code: Literal["negative_cash", "simplified_balance_sheet_imbalance", "non_computable_irr"]
    year: int = Field(ge=1, le=PROJECTION_YEARS)
    message: str


class LBOResult(FinancialSchema):
    transaction: TransactionSummary
    historical: HistoricalFinancials
    historical_cogs_ratio: float
    projected_years: tuple[YearProjection, ...] = Field(
        min_length=PROJECTION_YEARS, max_length=PROJECTION_YEARS
    )
    returns: ReturnsSummary
    diagnostics: tuple[ModelDiagnostic, ...]
