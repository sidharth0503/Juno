"use client";

import { CurrencyContext } from "@/lib/currency-context";
import { ModelTraceProvider } from "@/components/trace/ModelTrace";
import { useState } from "react";
import type { ModelTab } from "@/types/model";
import { useModel } from "@/lib/use-model";
import { AnalyticsRail } from "@/components/model/AnalyticsRail";
import { FinancialTable } from "@/components/model/FinancialTable";
import { ReturnsView } from "@/components/returns/ReturnsView";
import { TopToolbar } from "./TopToolbar";
import { ModelSidebar } from "./ModelSidebar";
import { MetricStrip } from "./MetricStrip";
import { ModelTabs } from "./ModelTabs";
import { StatusBar } from "./StatusBar";

export function TerminalShell() {
  const [tab, setTab] = useState<ModelTab>("summary");
  const model = useModel();
  const result = model.completed?.result ?? null;
  return <CurrencyContext value={model.company ? model.company.company.currency : "USD"}><ModelTraceProvider form={model.form} company={model.company} overrides={model.overrides}><div className="terminal-shell">
    <TopToolbar model={model} busy={model.status === "calculating" || model.loadingCompany} run={model.run} reset={model.reset} tab={tab} setTab={setTab} />
    <ModelSidebar company={model.company} overrides={model.overrides} reload={model.reloadCompany} loading={model.loadingCompany} form={model.form} update={model.update} />
    <main className="terminal-main">
      <MetricStrip result={result} />
      {model.exportError && <div className="error-banner export-error" role="alert"><b>EXPORT ERROR</b><span>{model.exportError}</span><button className="terminal-button" onClick={model.exportModel} disabled={model.exporting}>RETRY EXPORT</button></div>}
      {model.exportNotice && <div className="stale-banner export-notice" role="status">{model.exportNotice}</div>}
      {model.companyError && <div className="error-banner company-error" role="alert"><b>COMPANY DATA ERROR</b><span>{model.companyError}</span></div>}
      <ModelTabs active={tab} setActive={setTab} />
      {model.error && <div className="error-banner" role="alert"><b>MODEL ERROR</b><span>{model.error}</span><button className="terminal-button" onClick={model.run}>RETRY</button></div>}
      {(model.dirty || model.status === "calculating" && result || model.status === "error" && result) && <div className="stale-banner" role="status">
        {model.status === "calculating" ? "CALCULATING — displaying the last successful result." : "LAST SUCCESSFUL RESULT — current inputs have not been successfully calculated."}
      </div>}
      <div id="model-view" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} aria-busy={model.status === "calculating"}>
        {tab === "returns" ? <ReturnsView result={result} sensitivity={model.sensitivity} sensitivityStatus={model.sensitivityStatus} sensitivityError={model.sensitivityError} retrySensitivity={model.retrySensitivity} /> : result ? <div className="summary-layout">
          <FinancialTable result={result} tab={tab} /><AnalyticsRail result={result} />
        </div> : <section className="empty-workspace"><span className="blue">›_</span><h2>{model.status === "calculating" ? "CALCULATING MODEL" : "MODEL WORKSPACE"}</h2>
          <p>{model.status === "calculating" ? "Building the five-year projection from your inputs…" : "Your inputs are ready. Run the model when the calculation API is available."}</p>
          <p className="muted">Financial results will appear only after a successful API calculation.</p>
        </section>}
      </div>
    </main>
    <StatusBar company={model.company} loading={model.loadingCompany} companyError={model.companyError} status={model.status} connected={model.connected} dirty={model.dirty} />
  </div></ModelTraceProvider></CurrencyContext>;
}
