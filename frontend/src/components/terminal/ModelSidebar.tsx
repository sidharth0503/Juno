import { INPUT_FIELDS, type InputDefinition, type InputGroup, type ModelForm } from "@/lib/model-inputs";
import { Badge } from "@/components/ui/TerminalPanel";
import type { CompanyResponse, HistoricalField } from "@/types/company";
import { useCurrency } from "@/lib/currency-context";
import { formatNumber } from "@/lib/format";

export function ModelSidebar({ company, overrides, reload, loading, form, update }: {
  company: CompanyResponse | null; overrides: Record<string, boolean>; reload: () => void; loading: boolean;
  form: ModelForm; update: (group: InputGroup, key: string, value: string) => void;
}) {
  const { currencyLabel } = useCurrency();
  const input = (group: InputGroup, field: InputDefinition) => {
    const id = `${group}-${field.key}`;
    const value = (form[group] as Record<string, string>)[field.key];
    const historical = group === "historical";
    const source = historical && company ? company.base_year.provenance[field.key as HistoricalField] : null;
    const label = historical && !value.trim() ? "MISSING" : !source || overrides[field.key] ? "MANUAL" : source.status === "missing" ? "MISSING" : "SRC";
    const unit = historical ? "M" : field.unit;
    return <div className="assumption-row" key={field.key}>
      <label htmlFor={id}>{field.label}</label>
      <div className="input-wrap"><input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        aria-label={`${field.label} (${unit})`} placeholder="REQUIRED" aria-required={historical} aria-invalid={historical && !value.trim()}
        value={value}
        onChange={event => update(group, field.key, event.target.value)} />
        <span aria-hidden="true">{unit}</span>
      </div><span className={`input-source ${label === "MISSING" ? "amber" : label === "SRC" ? "blue" : ""}`} title={source?.source ?? label}>{label}</span>
    </div>;
  };
  return <aside className="model-sidebar" aria-label="Model assumptions">
    <div className="sidebar-heading"><h1>MODEL ASSUMPTIONS</h1><Badge tone="blue">EDITABLE</Badge></div>
    {company && <div className="company-context"><strong>{company.company.company_name ?? company.company.ticker}</strong>
      <p>{[company.company.ticker, company.company.exchange, `FY${company.base_year.fiscal_year}`, company.company.provider.toUpperCase()].filter(Boolean).join(" · ")}</p>
    </div>}
    <section className="assumption-section"><h2>TRANSACTION INPUTS <span>ENTRY VAL</span></h2>
      {INPUT_FIELDS.transaction_assumptions.map(field => input("transaction_assumptions", field))}
      <div className="sidebar-note">Single debt balance · 5-year hold</div>
    </section>
    <section className="assumption-section"><h2>OPERATING ASSUMPTIONS <span>PROJECTIONS</span></h2>
      {INPUT_FIELDS.operating_assumptions.map(field => input("operating_assumptions", field))}
    </section>
    <section className="assumption-section"><h2>BASE HISTORICALS <span>{company ? `FY${company.base_year.fiscal_year}` : "YEAR 0"} · M</span></h2>
      <p className="sidebar-note">{currencyLabel} · annual base inputs</p>
      {INPUT_FIELDS.historical.slice(0, 4).map(field => input("historical", field))}
      <details className="full-inputs" key={company?.company.ticker ?? "demo"} open={company ? true : undefined}><summary>FULL BASE INPUTS <span>6 MORE</span></summary>
        {INPUT_FIELDS.historical.slice(4).map(field => input("historical", field))}
      </details>
    </section>
    {company && <section className="company-history assumption-section">
      <h2>ANNUAL HISTORY <span>{company.company.provider.toUpperCase()}</span></h2>
      <p className="sidebar-note">{company.company.sector}{company.company.industry ? ` · ${company.company.industry}` : ""}</p>
      <details><summary>VIEW {company.historical_periods.length} ANNUAL PERIODS</summary>
        <div className="table-scroll"><table><caption>{currencyLabel} · provider values</caption><thead><tr><th>FIELD</th>{company.historical_periods.map(p => <th key={p.period_end} title={p.period_end}>FY{p.fiscal_year}</th>)}</tr></thead>
          <tbody>{INPUT_FIELDS.historical.map(field => <tr key={field.key}><th>{field.label}</th>{company.historical_periods.map(p => <td key={p.period_end}>{formatNumber(p[field.key as HistoricalField])}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
      <button className="terminal-button" onClick={reload} disabled={loading}>RELOAD COMPANY</button>
      {company.warnings.length > 0 && <details className="company-warnings" open><summary>DATA WARNINGS ({company.warnings.length})</summary><ul>{company.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    </section>}
    <div className="sidebar-footer"><span className="blue">◆</span> {company ? "COMPANY MODEL WORKSPACE" : "MANUAL MODEL WORKSPACE"}
      <p>{company ? "SRC values are imported. Edits become MANUAL. Fill missing inputs before RUN MODEL. Reload restores sourced values." : "Demo inputs are illustrative, not Apple financial data."}</p>
      <p>Values in {currencyLabel}. Edit assumptions, then run the model.</p>
    </div>
  </aside>;
}
