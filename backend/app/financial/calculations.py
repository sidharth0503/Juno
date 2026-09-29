"""Pure arithmetic helpers; amounts are never rounded for presentation."""

from dataclasses import dataclass
from math import isfinite

from app.financial.exceptions import FinancialModelError
from app.financial.models import PROJECTION_YEARS


def require_finite(**values: float) -> None:
    """Reject overflow as well as non-finite input instead of returning corrupt results."""
    for name, value in values.items():
        if not isfinite(value):
            raise FinancialModelError(f"{name} must be finite; model arithmetic overflowed or input is invalid")


def calculate_historical_cogs_ratio(cogs: float, revenue: float) -> float:
    """Hold the Year 0 expense/revenue ratio constant; EBITDA is independent."""
    require_finite(cogs=cogs, revenue=revenue)
    if revenue <= 0 or cogs < 0:
        raise FinancialModelError("Historical revenue must be positive and COGS nonnegative")
    ratio = cogs / revenue
    require_finite(historical_cogs_ratio=ratio)
    return ratio


def calculate_revenue(prior_revenue: float, growth_rate: float) -> float:
    return prior_revenue * (1 + growth_rate)


@dataclass(frozen=True)
class WorkingCapital:
    accounts_receivable: float
    inventory: float
    accounts_payable: float
    nwc: float
    change_in_nwc: float


def calculate_working_capital(
    revenue: float, cogs: float, dso_days: float, dio_days: float,
    dpo_days: float, prior_nwc: float,
) -> WorkingCapital:
    accounts_receivable = (dso_days / 365) * revenue
    inventory = (dio_days / 365) * cogs
    accounts_payable = (dpo_days / 365) * cogs
    nwc = accounts_receivable + inventory - accounts_payable
    return WorkingCapital(accounts_receivable, inventory, accounts_payable, nwc, nwc - prior_nwc)


def calculate_depreciation(beginning_ppe: float) -> float:
    """Current-year capex is not depreciated in the current year."""
    return beginning_ppe * 0.20


def calculate_taxes(ebt: float, tax_rate: float) -> float:
    return ebt * tax_rate if ebt > 0 else 0.0


def calculate_cfads(
    net_income: float, depreciation: float, change_in_nwc: float, capex: float,
) -> float:
    """A working-capital increase consumes cash; negative CFADS is preserved."""
    return net_income + depreciation - change_in_nwc - capex


@dataclass(frozen=True)
class DebtPaydown:
    mandatory_debt_paydown: float
    optional_debt_paydown: float
    ending_debt: float
    retained_cash_flow: float


def calculate_debt_paydown(
    beginning_debt: float, original_debt: float, cfads: float,
) -> DebtPaydown:
    """Pay 1% of ORIGINAL debt, then sweep positive residual CFADS, capped at debt.

    Mandatory repayment still occurs during a cash shortfall. Negative retained
    cash flow reduces cash; it never creates borrowing or a negative cash sweep.
    """
    require_finite(beginning_debt=beginning_debt, original_debt=original_debt, cfads=cfads)
    if beginning_debt < 0 or original_debt < 0:
        raise FinancialModelError("Debt balances must be nonnegative")
    mandatory = min(original_debt * 0.01, beginning_debt)
    remaining = beginning_debt - mandatory
    optional = min(max(cfads - mandatory, 0.0), remaining)
    ending_debt = remaining - optional
    # The capped subtraction is nonnegative by construction; do not hide defects.
    if ending_debt < 0:
        raise FinancialModelError("Debt repayment exceeded beginning debt")
    retained = cfads - mandatory - optional
    require_finite(retained_cash_flow=retained)
    return DebtPaydown(mandatory, optional, ending_debt, retained)


def calculate_irr(exit_equity: float, initial_equity: float) -> float | None:
    """Five-year, entry/exit-only IRR; nonpositive exit equity is non-computable."""
    require_finite(exit_equity=exit_equity, initial_equity=initial_equity)
    if initial_equity <= 0:
        raise FinancialModelError("Initial equity must be positive")
    if exit_equity <= 0:
        return None
    ratio = exit_equity / initial_equity
    require_finite(equity_multiple=ratio)
    return ratio ** (1 / PROJECTION_YEARS) - 1
