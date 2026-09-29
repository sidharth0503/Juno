# Phase 1 financial engine

The engine uses Python arithmetic and existing Pydantic schemas. It does not
import FastAPI or access external services. All monetary inputs must use the
same units; all rates are decimal fractions. There are exactly five projected
years after historical Year 0. Outputs preserve floating-point precision.

## Python interface

From the backend directory (using its virtual environment):

```python
from app.financial import (
    HistoricalFinancials, OperatingAssumptions,
    TransactionAssumptions, run_lbo_model,
)

historical = HistoricalFinancials(
    revenue=1000, cogs=600, ebitda=300, cash=50,
    accounts_receivable=100, inventory=80, accounts_payable=60,
    ppe=500, debt=200, shareholders_equity=470,
)
transaction = TransactionAssumptions(
    purchase_multiple_ev_ebitda=10, debt_percentage=0.7,
    interest_rate=0.08, exit_multiple=10,
)
operating = OperatingAssumptions(
    revenue_growth_rate=0.05, ebitda_margin=0.3, tax_rate=0.25,
    dso_days=45, dio_days=60, dpo_days=30, capex_pct_of_rev=0.04,
)
result = run_lbo_model(historical, transaction, operating)
print(result.projected_years[0].cfads)
print(result.returns.moic, result.returns.irr)
```

Inputs and results are immutable Pydantic models; collections in results are
tuples. Schemas reject non-finite values and unknown fields. Historical revenue
must be positive; COGS and PP&E must be nonnegative to preserve the positive
expense/depreciation conventions. Negative historical equity and cash are
allowed. Schema failures raise `pydantic.ValidationError`; impossible
capitalization or arithmetic overflow raises `FinancialModelError`.

## Prescribed conventions

- Acquisition EV uses historical EBITDA times purchase multiple. Acquisition
  debt is EV times debt percentage, independent of historical debt. Initial
  equity is EV times `(1 - debt_percentage)` and must be positive.
- Revenue grows from the previous year. COGS uses the constant historical
  COGS/revenue ratio. EBITDA separately uses projected revenue times EBITDA margin.
- AR uses revenue and DSO/365; inventory and AP use COGS and DIO/365 or DPO/365.
  NWC is AR + inventory - AP. An increase in NWC consumes cash.
- Depreciation is 20% of beginning PP&E. CapEx is revenue times its assumption.
  Ending PP&E is beginning PP&E + CapEx - depreciation.
- Interest uses beginning-of-year acquisition/rolling debt, never average or
  ending debt. Taxes are EBT times tax rate only when EBT is positive.
- CFADS = net income + depreciation - change in NWC - CapEx. This is already
  after interest; interest is not subtracted again in the debt schedule.
- Mandatory amortization is 1% of original acquisition debt, capped at beginning
  debt. It occurs even when CFADS is insufficient. Optional paydown sweeps only
  positive CFADS remaining after mandatory paydown and is capped at remaining debt.
- Negative CFADS is preserved; no revolver or new borrowing covers shortfalls.
  Retained cash flow is CFADS less both repayments. Cash rolls forward by this
  amount, including negative amounts, with no minimum cash or accounting plug.
- Equity rolls from historical equity plus net income. Assets are cash + AR +
  inventory + PP&E; liabilities are AP + debt. `balance_check` is assets less
  liabilities less equity. It is a simplified diagnostic, not purchase accounting.
- Exit EV uses Year 5 EBITDA. Exit equity is exit EV less Year 5 debt; cash is
  deliberately excluded under the specified convention. MOIC is exit equity /
  initial equity. IRR is MOIC ** (1/5) - 1 for positive exit equity; otherwise
  it is `None`, while zero or negative MOIC is retained. No interim distributions.

`diagnostics` contains typed codes and years for `negative_cash`,
`simplified_balance_sheet_imbalance`, and `non_computable_irr`. The balance
diagnostic uses `math.isclose(assets, liabilities + equity, rel_tol=1e-10,
abs_tol=1e-8)` only to disregard floating-point noise. Actual values are never
adjusted to pass the check.

## Independent golden-case audit

The example above is the test fixture. Year 0 NWC = 100 + 80 - 60 = 120.
Acquisition EV = 300 × 10 = 3000; debt = 2100; equity = 900.

Year 1 revenue = 1050, COGS = 630, EBITDA = 315. AR = 1050 × 45/365;
inventory = 630 × 60/365; AP = 630 × 30/365; NWC = 181.23287671232877.
CapEx = 42; depreciation = 100; ending PP&E = 442. Interest = 168;
EBIT = 215; EBT = 47; taxes = 11.75; net income = 35.25.
CFADS = 35.25 + 100 - (181.23287671232877 - 120) - 42
= 32.01712328767123. Mandatory paydown = 21; optional = 11.01712328767123.
Ending debt = 2067.98287671232877.

The following independent recurrence was evaluated with standard-library
`Decimal` at 40-digit precision to establish the constants in the golden test.
It does not use any engine helpers. For this fixture all annual EBT values and
CFADS after mandatory amortization are positive and debt remains outstanding:

```text
R[0] = 1000; P[0] = 500; D[0] = 2100; W[0] = 120
R[t] = 1.05 * R[t-1]
W[t] = (45 + 0.6 * (60 - 30)) * R[t] / 365
NI[t] = 0.75 * (0.3 * R[t] - 0.2 * P[t-1] - 0.08 * D[t-1])
F[t] = NI[t] + 0.2 * P[t-1] - (W[t] - W[t-1]) - 0.04 * R[t]
D[t] = D[t-1] - F[t]
P[t] = 0.8 * P[t-1] + 0.04 * R[t]
```

| Year | Revenue | EBITDA | CFADS | Ending debt |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1050 | 315 | 32.01712328767123 | 2067.98287671232877 |
| 2 | 1102.5 | 330.75 | 92.92188356164384 | 1975.06099315068493 |
| 3 | 1157.625 | 347.2875 | 106.02723938356164 | 1869.03375376712329 |
| 4 | 1215.50625 | 364.651875 | 120.95941869520548 | 1748.07433507191781 |
| 5 | 1276.2815625 | 382.88446875 | 137.74725601297945 | 1610.32707905893836 |

Exit EV = 3828.8446875; exit equity = 2218.51760844106164;
MOIC = 2.465019564934513; IRR = 0.1977441934779717 (19.7744193478%).
The indicative balance check is -1900 each year because the recapitalization
replaces historical debt of 200 with acquisition debt of 2100 without purchase
accounting. The engine reports this difference rather than forcing it to zero.
