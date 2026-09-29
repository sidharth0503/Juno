"""Declarative explanation of authoritative results. No financial arithmetic."""
from dataclasses import dataclass

from app.financial import run_lbo_model
from app.financial.models import PROJECTION_YEARS
from app.schemas.trace import TraceInput, TraceNode, TraceReference, TraceRequest


class TraceSelectionError(ValueError):
    pass


@dataclass(frozen=True)
class Definition:
    label: str
    formula: str
    dependencies: tuple[str, ...]
    description: str
    notes: tuple[str, ...] = ()


# y: same-year result; p: previous-year result (historical fallback below).
# h/o/t: original inputs; g/r: transaction/returns; c: model convention.
ANNUAL = {
    "revenue": Definition("Revenue", "Prior Year Revenue × (1 + Revenue Growth)", ("p:revenue", "o:revenue_growth_rate"), "Annual revenue projected from the opening revenue balance."),
    "cogs": Definition("COGS", "Revenue × Historical COGS / Historical Revenue", ("y:revenue", "h:cogs", "h:revenue"), "Positive expense using the fixed historical COGS-to-revenue ratio.", ("COGS and EBITDA are independent projection conventions.",)),
    "ebitda": Definition("EBITDA", "Revenue × EBITDA Margin", ("y:revenue", "o:ebitda_margin"), "Operating earnings before modeled depreciation, interest and taxes."),
    "depreciation": Definition("Depreciation", "Beginning PP&E × Depreciation Rate", ("y:beginning_ppe", "c:depreciation_rate"), "Depreciation on opening PP&E.", ("20% of beginning PP&E; current-year CapEx is not depreciated this year.",)),
    "ebit": Definition("EBIT", "EBITDA − Depreciation", ("y:ebitda", "y:depreciation"), "Operating income after modeled depreciation."),
    "interest_expense": Definition("Interest Expense", "Beginning Debt × Interest Rate", ("y:beginning_debt", "t:interest_rate"), "Interest uses opening debt to avoid circularity."),
    "ebt": Definition("EBT", "EBIT − Interest Expense", ("y:ebit", "y:interest_expense"), "Earnings before tax."),
    "taxes": Definition("Taxes", "max(EBT × Tax Rate, 0)", ("y:ebt", "o:tax_rate"), "Tax on positive earnings only.", ("No tax benefit for losses and no NOL schedule.",)),
    "net_income": Definition("Net Income", "EBT − Taxes", ("y:ebt", "y:taxes"), "Earnings after interest and tax."),
    "accounts_receivable": Definition("Accounts Receivable", "DSO / Days per Year × Revenue", ("o:dso_days", "c:days_per_year", "y:revenue"), "Receivables from days sales outstanding."),
    "inventory": Definition("Inventory", "DIO / Days per Year × COGS", ("o:dio_days", "c:days_per_year", "y:cogs"), "Inventory based on projected cost of goods sold."),
    "accounts_payable": Definition("Accounts Payable", "DPO / Days per Year × COGS", ("o:dpo_days", "c:days_per_year", "y:cogs"), "Operating payables; not interest-bearing debt."),
    "nwc": Definition("NWC", "Accounts Receivable + Inventory − Accounts Payable", ("y:accounts_receivable", "y:inventory", "y:accounts_payable"), "Net operating working capital."),
    "prior_nwc": Definition("Prior NWC", "Prior Year NWC", ("p:nwc",), "Opening working capital used by the engine."),
    "change_in_nwc": Definition("Change in NWC", "NWC − Prior NWC", ("y:nwc", "y:prior_nwc"), "A positive working-capital change consumes cash."),
    "capex": Definition("CapEx", "Revenue × CapEx / Revenue", ("y:revenue", "o:capex_pct_of_rev"), "Capital spending based on revenue."),
    "cfads": Definition("CFADS", "Net Income + Depreciation − Change in NWC − CapEx", ("y:net_income", "y:depreciation", "y:change_in_nwc", "y:capex"), "Cash flow available for debt service, after interest and taxes.", ("Negative CFADS is retained; it does not trigger new borrowing.",)),
    "beginning_debt": Definition("Beginning Debt", "Prior Year Ending Debt", ("p:ending_debt",), "Opening acquisition debt balance."),
    "mandatory_debt_paydown": Definition("Mandatory Debt Paydown", "min(Initial Debt × Mandatory Amortization Rate, Beginning Debt)", ("g:initial_debt", "c:mandatory_rate", "y:beginning_debt"), "Amortization of original acquisition debt.", ("Mandatory repayment occurs even when CFADS is negative.",)),
    "optional_debt_paydown": Definition("Optional Debt Paydown", "min(max(CFADS − Mandatory Debt Paydown, 0), Beginning Debt − Mandatory Debt Paydown)", ("y:cfads", "y:mandatory_debt_paydown", "y:beginning_debt"), "Positive residual cash sweep capped at remaining debt."),
    "ending_debt": Definition("Ending Debt", "Beginning Debt − Mandatory Debt Paydown − Optional Debt Paydown", ("y:beginning_debt", "y:mandatory_debt_paydown", "y:optional_debt_paydown"), "Debt remaining after scheduled amortization and the cash sweep."),
    "retained_cash_flow": Definition("Retained Cash Flow", "CFADS − Mandatory Debt Paydown − Optional Debt Paydown", ("y:cfads", "y:mandatory_debt_paydown", "y:optional_debt_paydown"), "Cash remaining after debt service, including cash shortfalls."),
    "beginning_cash": Definition("Beginning Cash", "Prior Year Ending Cash", ("p:ending_cash",), "Opening cash balance."),
    "ending_cash": Definition("Ending Cash", "Beginning Cash + Retained Cash Flow", ("y:beginning_cash", "y:retained_cash_flow"), "Ending cash with no financing plug.", ("Negative cash is reported explicitly.",)),
    "beginning_ppe": Definition("Beginning PP&E", "Prior Year Ending PP&E", ("p:ending_ppe",), "Opening net PP&E."),
    "ending_ppe": Definition("Ending PP&E", "Beginning PP&E + CapEx − Depreciation", ("y:beginning_ppe", "y:capex", "y:depreciation"), "Net PP&E roll-forward."),
    "beginning_equity": Definition("Beginning Equity", "Prior Year Ending Equity", ("p:ending_equity",), "Opening book equity; no purchase accounting."),
    "ending_equity": Definition("Ending Equity", "Beginning Equity + Net Income", ("y:beginning_equity", "y:net_income"), "Indicative book equity roll-forward."),
    "total_assets": Definition("Total Assets", "Ending Cash + Accounts Receivable + Inventory + Ending PP&E", ("y:ending_cash", "y:accounts_receivable", "y:inventory", "y:ending_ppe"), "Assets included in the simplified model."),
    "total_liabilities": Definition("Total Liabilities", "Accounts Payable + Ending Debt", ("y:accounts_payable", "y:ending_debt"), "Liabilities included in the simplified model."),
    "balance_check": Definition("Balance Check", "Total Assets − Total Liabilities − Ending Equity", ("y:total_assets", "y:total_liabilities", "y:ending_equity"), "Unadjusted simplified balance-sheet difference.", ("Acquisition accounting is not modeled; imbalances are not plugged.",)),
}
GLOBAL = {
    "purchase_enterprise_value": Definition("Purchase Enterprise Value", "Historical EBITDA × Purchase Multiple", ("h:ebitda", "t:purchase_multiple_ev_ebitda"), "Entry enterprise valuation."),
    "initial_debt": Definition("Initial Debt", "Purchase Enterprise Value × Debt Financing", ("g:purchase_enterprise_value", "t:debt_percentage"), "Acquisition debt replaces historical debt."),
    "initial_equity": Definition("Initial Equity", "Purchase Enterprise Value × (1 − Debt Financing)", ("g:purchase_enterprise_value", "t:debt_percentage"), "Sponsor equity at entry; must be positive."),
    "exit_enterprise_value": Definition("Exit Enterprise Value", "Year 5 EBITDA × Exit Multiple", ("f:ebitda", "t:exit_multiple"), "Enterprise value at the end of the five-year hold."),
    "exit_debt": Definition("Exit Debt", "Year 5 Ending Debt", ("f:ending_debt",), "Debt repaid from exit enterprise value."),
    "exit_equity": Definition("Exit Equity", "Exit Enterprise Value − Year 5 Ending Debt", ("r:exit_enterprise_value", "f:ending_debt"), "Sponsor proceeds before any unmodeled adjustments.", ("Accumulated cash is not added to exit equity under the current model convention.",)),
    "moic": Definition("MOIC", "Exit Equity / Initial Equity", ("r:exit_equity", "g:initial_equity"), "Multiple of invested sponsor capital."),
    "irr": Definition("IRR", "(Exit Equity / Initial Equity)^(1 / Holding Period) − 1", ("r:exit_equity", "g:initial_equity", "c:holding_period"), "Annualized entry/exit-only sponsor return.", ("Five-year hold; no interim sponsor distributions.",)),
}
CONVENTIONS = {"depreciation_rate": (0.2, "percent"), "mandatory_rate": (0.01, "percent"), "days_per_year": (365, "days"), "holding_period": (PROJECTION_YEARS, "years")}
LABELS = {"revenue_growth_rate": "Revenue Growth", "ebitda_margin": "EBITDA Margin", "purchase_multiple_ev_ebitda": "Purchase Multiple", "debt_percentage": "Debt Financing", "capex_pct_of_rev": "CapEx / Revenue", "dso_days": "DSO", "dio_days": "DIO", "dpo_days": "DPO"}


def references(key, year):
    definition = ANNUAL[key] if year else GLOBAL[key]
    refs = list(definition.dependencies)
    formula = definition.formula
    if year == 1:
        replacements = {"p:revenue": "h:revenue", "p:ending_debt": "g:initial_debt", "p:ending_cash": "h:cash", "p:ending_ppe": "h:ppe", "p:ending_equity": "h:shareholders_equity"}
        refs = [replacements.get(r, r) for r in refs]
        if key == "prior_nwc":
            refs = ["h:accounts_receivable", "h:inventory", "h:accounts_payable"]
            formula = "Historical Accounts Receivable + Historical Inventory − Historical Accounts Payable"
        elif key in {"beginning_debt", "beginning_cash", "beginning_ppe", "beginning_equity"}:
            formula = {"beginning_debt": "Initial Debt", "beginning_cash": "Historical Cash", "beginning_ppe": "Historical PP&E", "beginning_equity": "Historical Shareholders Equity"}[key]
    return definition, refs, formula


def trace_model(request: TraceRequest) -> TraceNode:
    key, year = request.metric_key, request.year
    if key not in ANNUAL and key not in GLOBAL:
        raise TraceSelectionError("Unknown trace metric.")
    if key in ANNUAL and year is None:
        raise TraceSelectionError("This metric requires a year from 1 to 5.")
    if key in GLOBAL and year is not None:
        raise TraceSelectionError("Transaction and return metrics do not accept a year.")
    result = run_lbo_model(request.historical, request.transaction_assumptions, request.operating_assumptions)

    def resolve(ref, current_year):
        scope, name = ref.split(":")
        resolved_year = current_year if scope == "y" else current_year - 1 if scope == "p" else PROJECTION_YEARS if scope == "f" else None
        unit, origin, provider, source = "millions", "CALCULATED", None, None
        metric_key = name
        if scope in {"y", "p", "f"}:
            value = getattr(result.projected_years[resolved_year - 1], name)
        elif scope in {"h", "o", "t"}:
            group = {"h": "historical", "o": "operating_assumptions", "t": "transaction_assumptions"}[scope]
            value = getattr(getattr(request, group), name)
            metric_key = f"{group}.{name}"
            origin = "MANUAL"
            if scope == "h" and name in request.historical_provenance:
                p = request.historical_provenance[name]
                origin, provider, source = p.origin, p.provider, p.source
            elif scope != "h":
                unit = "days" if name.endswith("days") else "multiple" if "multiple" in name else "percent"
        elif scope == "c":
            value, unit = CONVENTIONS[name]
            metric_key, origin = f"convention.{name}", "CONVENTION"
        else:
            value = getattr(result.transaction if scope == "g" else result.returns, name)
        label = (ANNUAL.get(name) or GLOBAL.get(name)).label if name in ANNUAL or name in GLOBAL else LABELS.get(name, name.replace("_", " ").title())
        if scope == "h": label = f"Historical {label}"
        return TraceInput(metric_key=metric_key, label=label, year=resolved_year, value=value, unit=unit, origin=origin, provider=provider, source=source)

    definition, refs, formula = references(key, year)
    inputs = tuple(resolve(ref, year) for ref in refs)
    value = getattr(result.projected_years[year - 1], key) if year else getattr(result.transaction if key in {"purchase_enterprise_value", "initial_debt", "initial_equity"} else result.returns, key)
    downstream = []
    for candidate, candidate_year in [(k, y) for y in range(1, 6) for k in ANNUAL] + [(k, None) for k in GLOBAL]:
        d, candidate_refs, _ = references(candidate, candidate_year)
        if any((i.metric_key, i.year) == (key, year) for i in (resolve(r, candidate_year) for r in candidate_refs)):
            downstream.append(TraceReference(metric_key=candidate, label=d.label, year=candidate_year))
    notes = list(definition.notes)
    if key == "irr" and value is None:
        notes.append("IRR is not computable because Exit Equity <= 0.")
    notes.append("Values are read from the authoritative model. Amounts are in millions; expense values retain the engine's positive expense convention.")
    if request.historical_provenance:
        notes.append("Historical origin labels are supplied by the client import/override state; they are descriptive, not independently verified provider evidence.")
    return TraceNode(metric_key=key, label=definition.label, year=year, value=value,
        unit="percent" if key == "irr" else "multiple" if key == "moic" else "millions",
        formula=formula, description=definition.description, inputs=inputs,
        dependencies=tuple(TraceReference(metric_key=i.metric_key, label=i.label, year=i.year) for i in inputs),
        provenance=inputs, downstream_metrics=tuple(downstream), notes=tuple(notes))
