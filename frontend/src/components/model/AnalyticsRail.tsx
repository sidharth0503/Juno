import { useCurrency } from "@/lib/currency-context";
import type { ModelCalculateResponse } from "@/types/model";
import { formatMultiple, formatPercent } from "@/lib/format";
import { Badge, TerminalPanel } from "@/components/ui/TerminalPanel";

export function DebtTrajectory({ result }: { result: ModelCalculateResponse }) {
  const { formatCurrency } = useCurrency();
  const values = [result.transaction.initial_debt, ...result.projected_years.map(year => year.ending_debt)];
  const maximum = Math.max(...values, 1);
  return <TerminalPanel title="DEBT DELEVERAGING" meta={<span className="blue">5Y</span>}>
    <div className="panel-body"><div className="debt-endpoints"><div><small>INITIAL DEBT</small><strong className="red">{formatCurrency(values[0], true)}</strong></div>
      <span className="muted">→</span><div><small>EXIT / YEAR 5</small><strong className="green">{formatCurrency(values[5], true)}</strong></div></div>
      <div className="debt-bars">{values.map((value, index) => <div className="debt-bar-row" key={index}>
        <span>{index === 0 ? "ENTRY" : `Y${index}`}</span><div className="bar-track"><div className={`bar-fill ${index === 0 ? "entry" : index === 5 ? "exit" : ""}`} style={{ width: `${value / maximum * 100}%` }} /></div>
        <b>{formatCurrency(value)}</b>
      </div>)}</div>
    </div>
  </TerminalPanel>;
}
export function ReturnAttribution({ result }: { result: ModelCalculateResponse }) {
  const { formatCurrency, formatSignedCurrency } = useCurrency();
  return <TerminalPanel title="RETURNS ATTRIBUTION" meta={<Badge tone="blue">MODEL</Badge>}>
    <div className="panel-body"><div className="rail-return-strip">
      <div><small>IRR</small><strong className={result.returns.irr !== null && result.returns.irr < 0 ? "red" : "green"}>{result.returns.irr === null ? "N/A" : formatPercent(result.returns.irr)}</strong></div>
      <div><small>MOIC</small><strong className={result.returns.moic < 0 ? "red" : "green"}>{formatMultiple(result.returns.moic)}</strong></div>
    </div><dl className="data-list">
      <div><dt>Entry EV</dt><dd>{formatCurrency(result.transaction.purchase_enterprise_value, true)}</dd></div>
      <div><dt>Exit EV</dt><dd>{formatCurrency(result.returns.exit_enterprise_value, true)}</dd></div>
      <div><dt>Initial Equity</dt><dd>{formatCurrency(result.transaction.initial_equity, true)}</dd></div>
      <div><dt>Exit Equity</dt><dd>{formatCurrency(result.returns.exit_equity, true)}</dd></div>
      <div><dt>Net Gain</dt><dd>{formatSignedCurrency(result.returns.exit_equity - result.transaction.initial_equity)}</dd></div>
    </dl></div>
  </TerminalPanel>;
}
export function ModelAudit({ result }: { result: ModelCalculateResponse }) {
  const balanceWarnings = result.diagnostics.filter(d => d.code === "simplified_balance_sheet_imbalance");
  const cashWarnings = result.diagnostics.filter(d => d.code === "negative_cash");
  const contiguousDebt = result.projected_years.every((year, index) => year.beginning_debt === (index === 0 ? result.transaction.initial_debt : result.projected_years[index - 1].ending_debt));
  return <TerminalPanel title="MODEL AUDIT / CHECKS" meta={<Badge tone={result.diagnostics.length ? "amber" : "green"}>{result.diagnostics.length ? "REVIEW" : "REPORTED"}</Badge>}>
    <div className="panel-body"><dl className="data-list audit-list">
      <div><dt>Projection horizon</dt><dd>{result.projected_years.length} YEARS</dd></div>
      <div><dt>Debt opening balances</dt><dd className={contiguousDebt ? "green" : "amber"}>{contiguousDebt ? "MATCH" : "REVIEW"}</dd></div>
      <div><dt>Simplified balance sheet</dt><dd className={balanceWarnings.length ? "amber" : "muted"}>{balanceWarnings.length ? `${balanceWarnings.length} FLAGS` : "NO FLAGS"}</dd></div>
      <div><dt>Negative cash</dt><dd className={cashWarnings.length ? "red" : "muted"}>{cashWarnings.length ? `${cashWarnings.length} FLAGS` : "NO FLAGS"}</dd></div>
    </dl><details className="diagnostic-details" open><summary>BACKEND DIAGNOSTICS ({result.diagnostics.length})</summary>
      {result.diagnostics.length === 0 ? <p>No diagnostic flags returned.</p> : <ul>{result.diagnostics.map((diagnostic, index) =>
        <li key={`${diagnostic.code}-${index}`}><b>Y{diagnostic.year}</b> {diagnostic.message}</li>)}</ul>}
    </details></div>
  </TerminalPanel>;
}
export function AnalyticsRail({ result }: { result: ModelCalculateResponse }) {
  return <aside className="analytics-rail" aria-label="Model analytics"><DebtTrajectory result={result} /><ReturnAttribution result={result} /><ModelAudit result={result} /></aside>;
}
