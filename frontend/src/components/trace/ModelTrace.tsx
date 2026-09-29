"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CompanyResponse } from "@/types/company";
import type { TraceResponse } from "@/types/trace";
import type { ModelForm } from "@/lib/model-inputs";
import { fetchTrace, traceRequest } from "@/lib/trace";
import { useCurrency } from "@/lib/currency-context";
import { formatMultiple, formatPercent, formatNumber } from "@/lib/format";

const TraceContext = createContext<(metric: string, year?: number) => void>(() => {});
export function TraceValue({ metric, year, children }: { metric: string; year?: number; children: ReactNode }) {
  const open = useContext(TraceContext);
  return <button className="trace-value" data-trace={metric} data-year={year} title={`Inspect ${year ? `Year ${year} ` : ""}${metric.replaceAll("_", " ")}`}
    aria-label={`Trace ${year ? `Year ${year} ` : ""}${metric.replaceAll("_", " ")}`} onClick={() => open(metric, year)}>{children}</button>;
}
export function ModelTraceProvider({ form, company, overrides, children }: { form: ModelForm; company: CompanyResponse | null; overrides: Record<string, boolean>; children: ReactNode }) {
  const signature = JSON.stringify([form, company?.company, overrides]);
  const [selection, setSelection] = useState<{ metric: string; year?: number; signature: string } | null>(null);
  const [previousSignature, setPreviousSignature] = useState(signature);
  if (previousSignature !== signature) {
    setPreviousSignature(signature);
    setSelection(null);
  }
  const [data, setData] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const visible = selection?.signature === signature;
  const { formatCurrency } = useCurrency();
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [signature]);
  useEffect(() => { if (visible) closeButton.current?.focus(); }, [visible]);
  const format = (value: number | null, unit: string) => value === null ? "N/A" : unit === "percent" ? formatPercent(value)
    : unit === "multiple" ? formatMultiple(value) : unit === "millions" ? formatCurrency(value, true) : `${formatNumber(value)} ${unit}`;
  function close() { active.current?.abort(); active.current = null; setSelection(null); trigger.current?.focus(); }
  async function open(metric: string, year?: number) {
    if (!visible) trigger.current = document.activeElement as HTMLElement;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setSelection({ metric, year, signature }); setData(null); setError(null); setLoading(true);
    const timer = window.setTimeout(() => controller.abort("timeout"), 15000);
    try {
      const next = await fetchTrace(traceRequest(form, company, overrides, metric, year), controller.signal);
      if (active.current === controller && !controller.signal.aborted) setData(next);
    } catch (e) {
      if (active.current !== controller || controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setError(controller.signal.reason === "timeout" ? "Trace timed out. Please retry." : e instanceof Error ? e.message : "Trace unavailable.");
    } finally { window.clearTimeout(timer); if (active.current === controller) setLoading(false); }
  }
  return <TraceContext value={(metric, year) => void open(metric, year)}>{children}
    {visible && <aside className="model-trace" role="dialog" aria-modal="false" aria-labelledby="trace-title" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header><h2 id="trace-title">MODEL TRACE</h2><button ref={closeButton} className="terminal-button" onClick={close} aria-label="Close model trace">CLOSE ×</button></header>
      <p className="trace-context">Current inputs · recalculated on inspection. Editing inputs closes this panel.</p>
      {loading && <p role="status">LOADING TRACE…</p>}
      {error && <div className="trace-error" role="alert"><b>TRACE UNAVAILABLE</b><p>{error}</p><button className="terminal-button" onClick={() => void open(selection!.metric, selection!.year)}>RETRY TRACE</button></div>}
      {data && <><h3>{data.year ? `YEAR ${data.year} ` : ""}{data.label.toUpperCase()}</h3>
        <strong className="trace-result">{format(data.value, data.unit)}</strong><p>{data.description}</p>
        <h4>FORMULA</h4><p className="trace-formula">{data.formula}</p>
        <h4>INPUT VALUES / PROVENANCE</h4><dl>{data.inputs.map(i => <div key={`${i.metric_key}-${i.year}`}><dt>{i.year ? `Year ${i.year} ` : ""}{i.label}</dt>
          <dd>{format(i.value, i.unit)} <small>{i.origin}{i.provider ? ` / ${i.provider.toUpperCase()}` : ""}{i.source ? ` · ${i.source}` : ""}</small></dd></div>)}</dl>
        <h4>DIRECT DEPENDENCIES</h4><ul>{data.dependencies.map(i => <li key={`${i.metric_key}-${i.year}`}>
          {i.metric_key.includes(".") ? i.label : <button className="trace-link" onClick={() => void open(i.metric_key, i.year ?? undefined)}>{i.year ? `Year ${i.year} ` : ""}{i.label}</button>}</li>)}</ul>
        <h4>DIRECT DOWNSTREAM IMPACT</h4><ul>{data.downstream_metrics.map(i => <li key={`${i.metric_key}-${i.year}`}><button className="trace-link" onClick={() => void open(i.metric_key, i.year ?? undefined)}>{i.year ? `Year ${i.year} ` : ""}{i.label}</button></li>)}</ul>
        {data.downstream_metrics.length === 0 && <p>Terminal model output.</p>}
        <h4>NOTES</h4><ul>{data.notes.map(n => <li key={n}>{n}</li>)}</ul>
      </>}
    </aside>}
  </TraceContext>;
}
