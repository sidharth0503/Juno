import pytest

from app.financial.calculations import (
    calculate_cfads, calculate_debt_paydown, calculate_depreciation,
    calculate_historical_cogs_ratio, calculate_irr, calculate_revenue,
    calculate_taxes, calculate_working_capital,
)
from app.financial.exceptions import FinancialModelError


def test_historical_cogs_ratio():
    assert calculate_historical_cogs_ratio(600, 1000) == pytest.approx(0.6)


@pytest.mark.parametrize("revenue", [0, -1])
def test_cogs_ratio_rejects_nonpositive_revenue(revenue):
    with pytest.raises(FinancialModelError, match="revenue must be positive"):
        calculate_historical_cogs_ratio(600, revenue)


def test_revenue_and_beginning_ppe_depreciation():
    assert calculate_revenue(1000, 0.05) == pytest.approx(1050)
    assert calculate_revenue(1050, 0.05) == pytest.approx(1102.5)
    assert calculate_depreciation(500) == pytest.approx(100)


def test_working_capital_formulas_and_cash_use_sign():
    result = calculate_working_capital(1050, 630, 45, 60, 30, 120)
    assert result.accounts_receivable == pytest.approx(45 / 365 * 1050)
    assert result.inventory == pytest.approx(60 / 365 * 630)
    assert result.accounts_payable == pytest.approx(30 / 365 * 630)
    expected_nwc = (45 * 1050 + 60 * 630 - 30 * 630) / 365
    assert result.nwc == pytest.approx(expected_nwc)
    assert result.change_in_nwc == pytest.approx(expected_nwc - 120)
    assert result.change_in_nwc > 0


@pytest.mark.parametrize("ebt, expected", [(100, 25), (0, 0), (-100, 0)])
def test_taxes(ebt, expected):
    assert calculate_taxes(ebt, 0.25) == pytest.approx(expected)


@pytest.mark.parametrize("change, expected", [(20, 65), (-20, 105)])
def test_cfads_adds_back_depreciation_and_subtracts_nwc_and_capex(change, expected):
    assert calculate_cfads(100, 15, change, 30) == pytest.approx(expected)


@pytest.mark.parametrize(
    "beginning, original, cfads, mandatory, optional, ending, retained",
    [
        (1000, 2100, 100, 21, 79, 900, 0),
        (10, 2100, 100, 10, 0, 0, 90),
        (100, 2100, -50, 21, 0, 79, -71),
        (100, 2100, 10, 21, 0, 79, -11),
        (100, 2100, 21, 21, 0, 79, 0),
        (100, 2100, 200, 21, 79, 0, 100),
        (0, 2100, 200, 0, 0, 0, 200),
        (0, 0, -50, 0, 0, 0, -50),
        (1e-12, 2100, 1, 1e-12, 0, 0, 1 - 1e-12),
    ],
)
def test_debt_paydown_boundaries(beginning, original, cfads, mandatory, optional, ending, retained):
    result = calculate_debt_paydown(beginning, original, cfads)
    assert result.mandatory_debt_paydown == pytest.approx(mandatory)
    assert result.optional_debt_paydown == pytest.approx(optional)
    assert result.ending_debt == pytest.approx(ending)
    assert result.retained_cash_flow == pytest.approx(retained)
    assert 0 <= result.optional_debt_paydown <= beginning - result.mandatory_debt_paydown
    assert result.ending_debt >= 0


@pytest.mark.parametrize("beginning, original, cfads", [(-1, 10, 5), (10, -1, 5), (10, 10, float("inf"))])
def test_invalid_debt_states_raise_model_error(beginning, original, cfads):
    with pytest.raises(FinancialModelError):
        calculate_debt_paydown(beginning, original, cfads)


def test_five_year_irr():
    assert calculate_irr(3200, 100) == pytest.approx(1.0)
    assert calculate_irr(100, 100) == pytest.approx(0.0)
    assert calculate_irr(50, 100) == pytest.approx(0.5 ** 0.2 - 1)


@pytest.mark.parametrize("exit_equity", [0, -100])
def test_nonpositive_exit_equity_has_no_irr(exit_equity):
    assert calculate_irr(exit_equity, 100) is None


@pytest.mark.parametrize("initial_equity", [0, -100])
def test_nonpositive_initial_equity_is_invalid(initial_equity):
    with pytest.raises(FinancialModelError, match="Initial equity must be positive"):
        calculate_irr(100, initial_equity)


def test_overflow_is_explicit():
    with pytest.raises(FinancialModelError, match="finite"):
        calculate_historical_cogs_ratio(1e308, 1e-308)
    with pytest.raises(FinancialModelError, match="finite"):
        calculate_irr(1e308, 1e-308)
