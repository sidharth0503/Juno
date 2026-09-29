import type { SensitivityResponse } from "@/types/sensitivity";
import type { RequestStatus } from "@/types/model";
import { useCurrency } from "@/lib/currency-context";
import type { ModelCalculateResponse } from "@/types/model";
import { formatMultiple, formatPercent } from "@/lib/format";
import { Badge, TerminalPanel } from "@/components/ui/TerminalPanel";
import { SensitivityMatrix } from "./SensitivityMatrix";
import { TraceValue } from "@/components/trace/ModelTrace";

export function ReturnsView({ result, sensitivity, sensitivityStatus, sensitivityError, retrySensitivity }: { result: ModelCalculateResponse | null; sensitivity: SensitivityResponse | null; sensitivityStatus: RequestStatus; sensitivityError: string | null; retrySensitivity: () => void }) {
  const { formatCurrency, formatSignedCurrency } = useCurrency();
  const keys = ["initial_equity", "exit_enterprise_value", "moic", "irr"];
  const metrics = [
    ["INITIAL SPONSOR EQUITY", formatCurrency(result?.transaction.initial_equity, true), "ACQUISITION CAPITAL"],
    ["EXIT ENTERPRISE VALUE", formatCurrency(result?.returns.exit_enterprise_value, true), "YEAR 5 EBITDA × EXIT MULTIPLE"],
    ["SPONSOR MOIC", formatMultiple(result?.returns.moic), "ENTRY / EXIT RETURN"],
    ["5-YEAR IRR", result && result.returns.irr === null ? "N/A" : formatPercent(result?.returns.irr), result?.returns.irr === null ? "EXIT EQUITY IS NONPOSITIVE" : "ANNUALIZED RETURN"],
  ];
  return <div className="returns-view">
    <div className="returns-heading"><h2>SPONSOR RETURNS & SENSITIVITY</h2><Badge tone={result ? "blue" : "muted"}>{result ? "RETURNS: API RESULT" : "RETURNS: AWAITING API"}</Badge></div>
    <div className="return-kpis">{metrics.map(([label, value, note], index) => <section className="return-kpi" key={label}>
      <h3>{label}</h3><strong className={index >= 2 ? result && result.returns.exit_equity < 0 ? "red" : "green" : ""}>{result ? <TraceValue metric={keys[index]}>{value}</TraceValue> : value}</strong><small>{note}</small>
    </section>)}</div>
    {sensitivityError && <div className="error-banner sensitivity-error" role="alert"><b>SENSITIVITY ERROR</b><span>{sensitivityError}</span><button className="terminal-button" onClick={retrySensitivity}>RETRY SENSITIVITY</button></div>}
    {sensitivity ? <><div className="matrix-grid"><SensitivityMatrix metric="irr" data={sensitivity} /><SensitivityMatrix metric="moic" data={sensitivity} /></div>
      {sensitivity.warnings.length > 0 && <details className="sensitivity-warnings"><summary>SCENARIO WARNINGS ({sensitivity.warnings.length})</summary><ul>{sensitivity.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}</>
      : <p className="sensitivity-status" role="status">{sensitivityStatus === "calculating" ? "CALCULATING SENSITIVITY…" : "Run the model to refresh sensitivity for the current inputs."}</p>}
    <div className="returns-bottom">
      <TerminalPanel title="EQUITY VALUE CREATION" meta={<Badge tone="blue">REPORTED VALUES</Badge>}>
        <div className="panel-body"><dl className="data-list equity-list">
          <div><dt>Initial Sponsor Equity</dt><dd>{formatCurrency(result?.transaction.initial_equity, true)}</dd></div>
          <div><dt>Net Equity Gain</dt><dd>{formatSignedCurrency(result ? result.returns.exit_equity - result.transaction.initial_equity : undefined)}</dd></div>
          <div className="equity-total"><dt>EXIT EQUITY</dt><dd>{formatCurrency(result?.returns.exit_equity, true)}</dd></div>
        </dl><p className="panel-note">Detailed EBITDA, multiple and deleveraging attribution is not provided by this model.</p></div>
      </TerminalPanel>
      <TerminalPanel title="LEVERAGE CAPACITY" meta={<Badge tone="amber">COMING SOON</Badge>}>
        <div className="panel-body"><dl className="data-list">
          <div><dt>Acquisition Debt</dt><dd>{formatCurrency(result?.transaction.initial_debt, true)}</dd></div>
          <div><dt>Year 5 Debt</dt><dd>{formatCurrency(result?.returns.exit_debt, true)}</dd></div>
        </dl><p className="panel-note">Debt balances are real model outputs. Covenant testing, coverage ratios and underwriting approval are not implemented.</p></div>
      </TerminalPanel>
    </div>
  </div>;
}
