import { useCurrency } from "@/lib/currency-context";
import { Fragment } from "react";
import type { HistoricalFinancials, ModelCalculateResponse, ModelTab, YearProjection } from "@/types/model";
import { formatPercent } from "@/lib/format";
import { TraceValue } from "@/components/trace/ModelTrace";

interface Row {
  label: string; field?: keyof YearProjection; base?: keyof HistoricalFinancials;
  style?: "total" | "green" | "red" | "ratio" | "warning"; expense?: boolean;
  ratio?: "growth" | "margin";
}
interface Section { title: string; rows: Row[] }
const income: Section = { title: "CONSOLIDATED OPERATING MODEL", rows: [
  { label: "Total Revenue", field: "revenue", base: "revenue", style: "total" },
  { label: "Revenue Growth % YoY", ratio: "growth", style: "ratio" },
  { label: "Cost of Goods Sold", field: "cogs", base: "cogs", expense: true },
  { label: "EBITDA", field: "ebitda", base: "ebitda", style: "total" },
  { label: "EBITDA Margin %", ratio: "margin", style: "ratio" },
  { label: "Depreciation", field: "depreciation", expense: true },
  { label: "Operating Income (EBIT)", field: "ebit" },
  { label: "Interest Expense", field: "interest_expense", expense: true, style: "red" },
  { label: "Earnings Before Taxes", field: "ebt" },
  { label: "Taxes", field: "taxes", expense: true },
  { label: "Net Income", field: "net_income", style: "total" },
] };
const cash: Section = { title: "CASH FLOW AVAILABLE FOR DEBT SERVICE", rows: [
  { label: "Net Income", field: "net_income" },
  { label: "(+) Non-Cash Depreciation", field: "depreciation" },
  { label: "(−) Capital Expenditures", field: "capex", expense: true },
  { label: "(−) Change in Working Capital", field: "change_in_nwc", expense: true },
  { label: "TOTAL CFADS", field: "cfads", style: "green" },
] };
const debt: Section = { title: "DEBT BALANCES & CASH SWEEP", rows: [
  { label: "Beginning Debt Outstanding", field: "beginning_debt" },
  { label: "(−) Mandatory Debt Paydown", field: "mandatory_debt_paydown", expense: true },
  { label: "(−) Optional Debt Paydown", field: "optional_debt_paydown", expense: true },
  { label: "Ending Total Debt", field: "ending_debt", base: "debt", style: "total" },
] };
const balance: Section[] = [
  { title: "ASSETS", rows: [
    { label: "Cash", field: "ending_cash", base: "cash" },
    { label: "Accounts Receivable", field: "accounts_receivable", base: "accounts_receivable" },
    { label: "Inventory", field: "inventory", base: "inventory" },
    { label: "Property, Plant & Equipment", field: "ending_ppe", base: "ppe" },
    { label: "Total Assets", field: "total_assets", style: "total" },
  ] },
  { title: "LIABILITIES & EQUITY", rows: [
    { label: "Accounts Payable", field: "accounts_payable", base: "accounts_payable" },
    { label: "Debt", field: "ending_debt", base: "debt" },
    { label: "Total Liabilities", field: "total_liabilities", style: "total" },
    { label: "Shareholders Equity", field: "ending_equity", base: "shareholders_equity" },
    { label: "Simplified Balance Check", field: "balance_check", style: "warning" },
  ] },
];
const cashDetail: Section = { title: "FINANCING & CASH ROLL-FORWARD", rows: [
  ...debt.rows.slice(1, 3),
  { label: "Retained Cash Flow", field: "retained_cash_flow", style: "total" },
  { label: "Ending Cash", field: "ending_cash", base: "cash", style: "total" },
] };
const sectionsByTab: Record<Exclude<ModelTab, "returns">, Section[]> = {
  summary: [income, cash, debt], income: [income], cash: [cash, cashDetail], balance,
  debt: [{ ...debt, rows: [debt.rows[0], { label: "Interest Expense", field: "interest_expense", expense: true, style: "red" }, ...debt.rows.slice(1)] }],
};

function valueFor(row: Row, year: YearProjection | null, historical: HistoricalFinancials): number | undefined {
  // These are display-only ratios of reported values, never projection mechanics.
  if (row.ratio === "growth") return year && year.beginning_revenue !== 0 ? year.revenue / year.beginning_revenue - 1 : undefined;
  if (row.ratio === "margin") {
    const source = year ?? historical;
    return source.revenue !== 0 ? source.ebitda / source.revenue : undefined;
  }
  return year ? row.field ? year[row.field] : undefined : row.base ? historical[row.base] : undefined;
}
function FinancialRow({ row, result }: { row: Row; result: ModelCalculateResponse }) {
  const { formatCurrency } = useCurrency();
  return <tr className={`financial-row ${row.style ?? ""}`}>
    <th scope="row">{row.label}</th>
    {[null, ...result.projected_years].map((year, index) => {
      const value = valueFor(row, year, result.historical);
      const display = row.ratio ? formatPercent(value) : formatCurrency(value === undefined ? undefined : row.expense ? -value : value);
      return <td key={index} className={`${index === 0 ? "base-cell" : ""} ${value !== undefined && value < 0 && !row.expense ? "red" : ""}`}>
        {year && row.field ? <TraceValue metric={row.field} year={year.year}>{display}</TraceValue> : display}
      </td>;
    })}
  </tr>;
}
export function FinancialTable({ result, tab }: { result: ModelCalculateResponse; tab: Exclude<ModelTab, "returns"> }) {
  const { currencyLabel } = useCurrency();
  return <section className="financial-workspace">
    <header className="workspace-heading"><h2>{tab === "summary" ? "PRIMARY FINANCIAL PROJECTIONS & CASH WATERFALL" : `${tab === "balance" ? "SIMPLIFIED BALANCE SHEET" : tab === "cash" ? "CASH FLOW STATEMENT" : tab === "debt" ? "DEBT SCHEDULE" : "INCOME STATEMENT"}`}</h2><span>5 PROJECTED YEARS</span></header>
    {tab === "balance" && <p className="notice amber">Indicative balance sheet. Acquisition accounting is not modeled; differences are shown without cash plugs.</p>}
    <div className="table-scroll"><table className="financial-table">
      <caption className="sr-only">Five-year financial model in {currencyLabel}. Base values are historical, not acquisition capitalization.</caption>
      <thead><tr><th scope="col">LINE ITEM <span>(M)</span></th><th scope="col">BASE <small>YEAR 0</small></th>
        {result.projected_years.map(year => <th scope="col" key={year.year}>Y{year.year}<small>PROJECTED</small></th>)}
      </tr></thead>
      <tbody>{sectionsByTab[tab].map((section, index) => <Fragment key={section.title}>
        <tr className="section-row"><th colSpan={7} scope="colgroup">{index + 1}. {section.title}</th></tr>
        {section.rows.map(row => <FinancialRow key={row.label} row={row} result={result} />)}
      </Fragment>)}</tbody>
    </table></div>
    <footer className="table-footnote"><span>AMORTIZATION: 1% OF ORIGINAL DEBT</span><span>SWEEP: POSITIVE CFADS AFTER MANDATORY</span><span className="amber">SIMPLIFIED BS · SEE AUDIT</span></footer>
  </section>;
}
