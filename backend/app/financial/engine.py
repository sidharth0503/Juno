"""Chronological five-year LBO orchestration, independent of any web framework."""

from math import isclose

from app.financial.calculations import (
    calculate_cfads, calculate_debt_paydown, calculate_depreciation,
    calculate_historical_cogs_ratio, calculate_irr, calculate_revenue,
    calculate_taxes, calculate_working_capital, require_finite,
)
from app.financial.exceptions import FinancialModelError
from app.financial.models import (
    PROJECTION_YEARS, HistoricalFinancials, LBOResult, ModelDiagnostic,
    OperatingAssumptions, ReturnsSummary, TransactionAssumptions,
    TransactionSummary, YearProjection,
)


def run_lbo_model(
    historical: HistoricalFinancials,
    transaction_assumptions: TransactionAssumptions,
    operating_assumptions: OperatingAssumptions,
) -> LBOResult:
    """Run the specified V1 model without mutating inputs or rounding values.

    Historical debt is reference-only. Cash is not added to exit equity under
    this phase's prescribed returns convention. Balance checks are diagnostic,
    not transaction-adjusted acquisition accounting.
    """
    transaction = transaction_assumptions
    operating = operating_assumptions
    cogs_ratio = calculate_historical_cogs_ratio(historical.cogs, historical.revenue)
    purchase_enterprise_value = historical.ebitda * transaction.purchase_multiple_ev_ebitda
    initial_debt = purchase_enterprise_value * transaction.debt_percentage
    initial_equity = purchase_enterprise_value * (1 - transaction.debt_percentage)
    require_finite(
        purchase_enterprise_value=purchase_enterprise_value,
        initial_debt=initial_debt, initial_equity=initial_equity,
    )
    if initial_equity <= 0:
        raise FinancialModelError("Initial equity must be positive; check historical EBITDA and capitalization")
    summary = TransactionSummary(
        purchase_enterprise_value=purchase_enterprise_value,
        initial_debt=initial_debt, initial_equity=initial_equity,
    )
    projections: list[YearProjection] = []
    diagnostics: list[ModelDiagnostic] = []

    for year in range(1, PROJECTION_YEARS + 1):
        # A. Beginning balances: acquisition debt replaces historical debt.
        previous = projections[-1] if projections else None
        beginning_revenue = previous.revenue if previous else historical.revenue
        beginning_ppe = previous.ending_ppe if previous else historical.ppe
        beginning_debt = previous.ending_debt if previous else initial_debt
        prior_nwc = previous.nwc if previous else (
            historical.accounts_receivable + historical.inventory - historical.accounts_payable
        )
        beginning_cash = previous.ending_cash if previous else historical.cash
        beginning_equity = previous.ending_equity if previous else historical.shareholders_equity

        # B. Operating projection: COGS and EBITDA are independent conventions.
        revenue = calculate_revenue(beginning_revenue, operating.revenue_growth_rate)
        cogs = revenue * cogs_ratio
        ebitda = revenue * operating.ebitda_margin

        # C. Working capital: positive change in NWC is a use of cash.
        working_capital = calculate_working_capital(
            revenue, cogs, operating.dso_days, operating.dio_days,
            operating.dpo_days, prior_nwc,
        )

        # D. PP&E: depreciation uses beginning PP&E only.
        capex = revenue * operating.capex_pct_of_rev
        depreciation = calculate_depreciation(beginning_ppe)
        ending_ppe = beginning_ppe + capex - depreciation

        # E. Income statement: beginning-debt interest avoids circularity.
        ebit = ebitda - depreciation
        interest_expense = beginning_debt * transaction.interest_rate
        ebt = ebit - interest_expense
        taxes = calculate_taxes(ebt, operating.tax_rate)
        net_income = ebt - taxes

        # F. CFADS is after interest and tax, and may be negative.
        cfads = calculate_cfads(net_income, depreciation, working_capital.change_in_nwc, capex)

        # G. Debt: mandatory amortization, optional cash sweep, no new borrowing.
        debt = calculate_debt_paydown(beginning_debt, initial_debt, cfads)

        # H. Indicative balance sheet: preserve shortfalls and never plug cash.
        ending_cash = beginning_cash + debt.retained_cash_flow
        ending_equity = beginning_equity + net_income
        total_assets = ending_cash + working_capital.accounts_receivable + working_capital.inventory + ending_ppe
        total_liabilities = working_capital.accounts_payable + debt.ending_debt
        balance_check = total_assets - total_liabilities - ending_equity
        values = dict(
            beginning_revenue=beginning_revenue, revenue=revenue, cogs=cogs, ebitda=ebitda,
            beginning_ppe=beginning_ppe, capex=capex, depreciation=depreciation, ending_ppe=ending_ppe,
            ebit=ebit, beginning_debt=beginning_debt, interest_expense=interest_expense,
            ebt=ebt, taxes=taxes, net_income=net_income,
            accounts_receivable=working_capital.accounts_receivable,
            inventory=working_capital.inventory, accounts_payable=working_capital.accounts_payable,
            prior_nwc=prior_nwc, nwc=working_capital.nwc, change_in_nwc=working_capital.change_in_nwc,
            cfads=cfads, mandatory_debt_paydown=debt.mandatory_debt_paydown,
            optional_debt_paydown=debt.optional_debt_paydown, ending_debt=debt.ending_debt,
            beginning_cash=beginning_cash, retained_cash_flow=debt.retained_cash_flow,
            ending_cash=ending_cash, beginning_equity=beginning_equity, ending_equity=ending_equity,
            total_assets=total_assets, total_liabilities=total_liabilities, balance_check=balance_check,
        )
        require_finite(**values)
        projection = YearProjection(year=year, **values)
        projections.append(projection)
        if ending_cash < 0:
            diagnostics.append(ModelDiagnostic(
                code="negative_cash", year=year,
                message="Ending cash is negative; no financing has been added to cover the shortfall.",
            ))
        # Tolerance only suppresses floating-point noise in the diagnostic flag.
        # The actual balance_check is retained without adjustment or rounding.
        if not isclose(total_assets, total_liabilities + ending_equity, rel_tol=1e-10, abs_tol=1e-8):
            diagnostics.append(ModelDiagnostic(
                code="simplified_balance_sheet_imbalance", year=year,
                message="Simplified balance sheet does not balance; acquisition accounting is not modeled.",
            ))

    final_year = projections[-1]
    exit_enterprise_value = final_year.ebitda * transaction.exit_multiple
    exit_equity = exit_enterprise_value - final_year.ending_debt
    moic = exit_equity / initial_equity
    require_finite(exit_enterprise_value=exit_enterprise_value, exit_equity=exit_equity, moic=moic)
    irr = calculate_irr(exit_equity, initial_equity)
    if irr is None:
        diagnostics.append(ModelDiagnostic(
            code="non_computable_irr", year=PROJECTION_YEARS,
            message="IRR is not computed when exit equity is zero or negative.",
        ))
    return LBOResult(
        transaction=summary, historical=historical, historical_cogs_ratio=cogs_ratio,
        projected_years=tuple(projections), diagnostics=tuple(diagnostics),
        returns=ReturnsSummary(
            exit_enterprise_value=exit_enterprise_value, exit_debt=final_year.ending_debt,
            exit_equity=exit_equity, moic=moic, irr=irr,
        ),
    )
