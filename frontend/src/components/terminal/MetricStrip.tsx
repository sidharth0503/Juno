import { useCurrency } from "@/lib/currency-context";
import type { ModelCalculateResponse } from "@/types/model";
import { formatMultiple, formatPercent } from "@/lib/format";
import { TraceValue } from "@/components/trace/ModelTrace";

export function MetricStrip({ result }: { result: ModelCalculateResponse | null }) {
  const { formatCurrency } = useCurrency();
  const keys = ["purchase_enterprise_value", "initial_debt", "initial_equity", "exit_enterprise_value", "exit_equity", "moic", "irr"];
  const metrics = [
    ["PURCHASE EV", formatCurrency(result?.transaction.purchase_enterprise_value, true), "ENTRY VALUATION"],
    ["INITIAL DEBT", formatCurrency(result?.transaction.initial_debt, true), "ACQUISITION DEBT"],
    ["INITIAL EQUITY", formatCurrency(result?.transaction.initial_equity, true), "SPONSOR CAPITAL"],
    ["EXIT EV", formatCurrency(result?.returns.exit_enterprise_value, true), "YEAR 5"],
    ["EXIT EQUITY", formatCurrency(result?.returns.exit_equity, true), "SPONSOR PROCEEDS"],
    ["MOIC", formatMultiple(result?.returns.moic), "EQUITY MULTIPLE"],
    ["IRR (5Y)", result && result.returns.irr === null ? "N/A" : formatPercent(result?.returns.irr), "ANNUALIZED RETURN"],
  ];
  return <section className="metric-strip" aria-label="Model key metrics">
    {metrics.map(([label, value, note], index) => <div className={`metric ${index >= 5 ? "return-metric" : ""}`} key={label}>
      <span>{label}</span><strong className={index >= 4 && result && result.returns.exit_equity < 0 ? "red" : ""}>{result ? <TraceValue metric={keys[index]}>{value}</TraceValue> : value}</strong><small>{note}</small>
    </div>)}
  </section>;
}
