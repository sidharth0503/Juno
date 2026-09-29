import type { CompanyResponse, HistoricalPeriod } from "../types/company.ts";
import { INPUT_FIELDS, type ModelForm } from "./model-inputs.ts";

/** Values already arrive in millions. Preserve nulls as blank inputs. */
export function importHistorical(period: HistoricalPeriod): ModelForm["historical"] {
  return Object.fromEntries(INPUT_FIELDS.historical.map(({ key }) => {
    const value = period[key as keyof ModelForm["historical"]];
    return [key, value === null ? "" : String(value)];
  })) as ModelForm["historical"];
}

export class CompanyApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) { super(message); this.status = status; }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validPeriod(value: unknown): value is HistoricalPeriod {
  if (!record(value) || !Number.isInteger(value.fiscal_year) || typeof value.period_end !== "string" || !record(value.provenance)) return false;
  const provenance = value.provenance;
  return INPUT_FIELDS.historical.every(({ key }) => {
    const amount = value[key], source = provenance[key];
    return (amount === null || typeof amount === "number" && Number.isFinite(amount)) && record(source)
      && ["reported", "derived", "missing"].includes(String(source.status))
      && (source.source === null || typeof source.source === "string");
  });
}
function validResponse(value: unknown): value is CompanyResponse {
  if (!record(value) || !record(value.company)) return false;
  const profile = value.company;
  return typeof profile.ticker === "string" && !!profile.ticker && typeof profile.provider === "string"
    && ["company_name", "exchange", "currency", "sector", "industry", "latest_fiscal_period"].every(k => profile[k] === null || typeof profile[k] === "string")
    && value.units === "millions" && validPeriod(value.base_year)
    && Array.isArray(value.historical_periods) && value.historical_periods.length > 0 && value.historical_periods.length <= 3
    && value.historical_periods.every(validPeriod) && Array.isArray(value.warnings) && value.warnings.every(w => typeof w === "string");
}

export async function loadCompany(apiUrl: string, ticker: string, signal?: AbortSignal): Promise<CompanyResponse> {
  let response: Response;
  try { response = await fetch(`${apiUrl}/api/v1/company/${encodeURIComponent(ticker.trim().toUpperCase())}`, { signal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new CompanyApiError("Market data service unavailable. Check the backend connection.", null);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new CompanyApiError(body?.detail?.message ?? `Company request failed (${response.status}).`, response.status);
  if (!validResponse(body)) {
    throw new CompanyApiError("The company service returned an unsupported response.", response.status);
  }
  return body as CompanyResponse;
}
