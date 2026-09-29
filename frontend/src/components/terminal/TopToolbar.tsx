import type { useModel } from "@/lib/use-model";
import type { ModelTab } from "@/types/model";

export function TopToolbar({ model, busy, run, reset, tab, setTab }: {
  model: ReturnType<typeof useModel>; busy: boolean; run: () => void; reset: () => void; tab: ModelTab; setTab: (tab: ModelTab) => void;
}) {
  return <header className="top-toolbar">
    <div className="toolbar-left">
      <div className="brand"><span className="brand-icon" aria-hidden="true">›_</span><div>
        <strong>Juno</strong><small>PRO FINANCIAL MODELING</small>
      </div></div>
      <label className="ticker" htmlFor="company-ticker">TICKER: <input id="company-ticker" value={model.ticker} maxLength={32}
        onChange={event => model.setTicker(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !model.loadingCompany) model.load(); }} autoComplete="off" spellCheck={false} /></label>
      <button className="terminal-button company-load" onClick={model.load} disabled={model.loadingCompany}>{model.loadingCompany ? "LOADING…" : "LOAD"}</button>
      <span className="ticker-context" title={model.company?.company.company_name ?? "Manual demo"}>
        {model.company ? [model.company.company.ticker, model.company.company.company_name, model.company.company.exchange, `FY${model.company.base_year.fiscal_year}`].filter(Boolean).join(" │ ") : "DEMO CONTEXT │ MANUAL DATA"}
      </span>
      <button className="text-button" onClick={reset} disabled={busy} title={model.company ? "Restore assumptions; preserve company inputs and manual overrides" : "Restore golden-case inputs and recalculate"}>↺ RESET MODEL</button>
    </div>
    <div className="toolbar-right">
      <nav className="quick-nav" aria-label="Quick navigation">
        {([["summary", "SUMMARY"], ["debt", "DEBT"], ["returns", "RETURNS/IRR"]] as const).map(([key, label]) =>
          <button key={key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>
      <button className="terminal-button primary" onClick={run} disabled={busy}>{model.loadingCompany ? "AWAITING DATA…" : busy ? "CALCULATING…" : "▶ RUN MODEL"}</button>
      <button className="terminal-button export" onClick={model.exportModel} disabled={model.exporting || model.loadingCompany}
        title="Recalculate and export current inputs as a values-only workbook">{model.exporting ? "EXPORTING…" : "↓ EXPORT XLSX"}</button>
    </div>
  </header>;
}
