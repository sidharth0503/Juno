import { API_URL } from "./config.ts";
import { toRequest, type ModelForm } from "./model-inputs.ts";
import type { CompanyResponse, HistoricalField } from "../types/company.ts";
import type { TraceRequest, TraceResponse } from "../types/trace.ts";

export function traceRequest(form: ModelForm, company: CompanyResponse | null, overrides: Record<string, boolean>, metric: string, year?: number): TraceRequest {
  const input = toRequest(form);
  const historical_provenance = Object.fromEntries(Object.keys(input.historical).map(key => {
    const p = company?.base_year.provenance[key as HistoricalField];
    const manual = !p || overrides[key] || p.status === "missing";
    return [key, { origin: manual ? "MANUAL" : p.status === "derived" ? "DERIVED" : "SOURCE",
      provider: manual ? null : company!.company.provider, source: manual ? null : p.source }];
  })) as TraceRequest["historical_provenance"];
  return { ...input, metric_key: metric, ...(year === undefined ? {} : { year }), historical_provenance };
}
export async function fetchTrace(request: TraceRequest, signal?: AbortSignal): Promise<TraceResponse> {
  const response = await fetch(`${API_URL}/api/v1/model/trace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail?.message === "string" ? body.detail.message : `Trace unavailable (${response.status}). Check inputs and retry.`);
  if (!body || body.metric_key !== request.metric_key || body.year !== (request.year ?? null)
    || typeof body.label !== "string" || typeof body.formula !== "string" || typeof body.description !== "string"
    || !(body.value === null || typeof body.value === "number" && Number.isFinite(body.value))
    || !["millions", "percent", "multiple"].includes(body.unit)
    || !Array.isArray(body.inputs) || !Array.isArray(body.dependencies) || !Array.isArray(body.provenance)
    || !Array.isArray(body.downstream_metrics) || !Array.isArray(body.notes)) throw new Error("Unexpected trace response.");
  return body as TraceResponse;
}
