"""Annual statement labels to engine inputs; currency amounts become millions here."""
import math

from app.data.models import CompanyProfile, CompanyResponse, FieldSource, HistoricalPeriod
from app.data.providers.base import CompanyDataError, RawCompanyData

# Ordered candidates: native yfinance CamelCase and its pretty=True labels are
# matched equivalently. Never substitute gross PPE, total liabilities, or net debt.
FIELD_MAPPINGS = {
    "revenue": ("income", ("TotalRevenue", "OperatingRevenue")),
    "cogs": ("income", ("CostOfRevenue", "CostOfGoodsSold")),
    "ebitda": ("income", ("EBITDA",)),
    "cash": ("balance", ("CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments")),
    "accounts_receivable": ("balance", ("AccountsReceivable", "NetReceivables")),
    "inventory": ("balance", ("Inventory",)),
    "accounts_payable": ("balance", ("AccountsPayable",)),
    "ppe": ("balance", ("NetPPE",)),
    "debt": ("balance", ("TotalDebt",)),
    "shareholders_equity": ("balance", ("StockholdersEquity", "CommonStockEquity")),
}


def label_key(label: str) -> str:
    return "".join(c.lower() for c in label if c.isalnum())


def finite(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def normalize(ticker: str, raw: RawCompanyData) -> CompanyResponse:
    warnings = list(raw.warnings)
    periods = []
    # Ignore empty/all-NaN provider placeholder columns before choosing the latest 3.
    dates = sorted(d for d in raw.income.keys() | raw.balance.keys()
                   if any(finite(v) for rows in (raw.income, raw.balance) for v in rows.get(d, {}).values()))[-3:]
    for end in dates:
        values, provenance = {}, {}
        for field, (statement, candidates) in FIELD_MAPPINGS.items():
            rows = getattr(raw, statement).get(end, {})
            indexed = {label_key(k): (k, v) for k, v in rows.items() if finite(v)}
            matches = [indexed[label_key(c)] for c in candidates if label_key(c) in indexed]
            if not matches:
                values[field] = None
                provenance[field] = FieldSource(status="missing")
                warnings.append(f"{field.upper()} unavailable for FY{end.year}; manual input required.")
                continue
            label, value = matches[0]
            values[field] = value / 1_000_000
            provenance[field] = FieldSource(status="reported", source=label)
            if len(matches) > 1 and any(v != value for _, v in matches[1:]):
                warnings.append(f"FY{end.year} {field}: selected {label} by mapping priority over alternative reported rows.")
            if field == "cash" and label_key(label) != label_key(candidates[0]):
                warnings.append(f"FY{end.year} cash includes short-term investments; pure cash unavailable.")
            if field == "shareholders_equity" and label_key(label) != label_key(candidates[0]):
                warnings.append(f"FY{end.year} equity uses common stock equity; total stockholders equity unavailable.")
        periods.append(HistoricalPeriod(fiscal_year=end.year, period_end=end, provenance=provenance, **values))
    if not periods or not any(getattr(p, f) is not None for p in periods for f in FIELD_MAPPINGS):
        raise CompanyDataError("No supported annual financial statements are available for this ticker.", 422)
    if len(periods) < 3:
        warnings.append(f"Only {len(periods)} annual period(s) available; three-year history is incomplete.")
    if not raw.profile.get("currency"):
        warnings.append("Financial statement currency unavailable; no currency has been assumed or converted.")
    if not raw.profile.get("company_name"):
        warnings.append("Company name unavailable; ticker and available annual statements are shown.")
    profile = CompanyProfile(ticker=ticker, provider=raw.provider,
                             latest_fiscal_period=periods[-1].period_end, **raw.profile)
    return CompanyResponse(company=profile, historical_periods=periods, base_year=periods[-1], warnings=warnings)
