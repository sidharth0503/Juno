import type { CompanyResponse } from "@/types/company";
import type { RequestStatus } from "@/types/model";

export function StatusBar({ company, loading, companyError, status, connected, dirty }: { company: CompanyResponse | null; loading: boolean; companyError: string | null; status: RequestStatus; connected: boolean | null; dirty: boolean }) {
  const state = status === "calculating" ? "CALCULATING" : status === "error" ? "ERROR" : dirty ? "EDITED" : status.toUpperCase();
  return <footer className="status-bar" role="status">
    <div><span className={status === "error" ? "red" : dirty || status === "calculating" ? "amber" : "green"}>● MODEL: {state}</span>
      <span>DATA: {loading ? "FETCHING" : companyError ? "ERROR" : company ? Object.values(company.base_year.provenance).some(p => p.status === "missing") ? "PARTIAL" : company.company.provider.toUpperCase() : "MANUAL"}</span><span>TICKER: {company?.company.ticker ?? "DEMO"}</span><span>HORIZON: 5Y</span></div>
    <div><span>ENGINE: LOCAL</span><span className={connected === true ? "green" : connected === false ? "red" : "muted"}>
      API: {connected === true ? "CONNECTED" : connected === false ? "DISCONNECTED" : "CONNECTING"}</span></div>
  </footer>;
}
