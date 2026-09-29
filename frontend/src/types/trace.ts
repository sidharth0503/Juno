import type { ModelCalculateRequest } from "./model.ts";
import type { HistoricalField } from "./company.ts";

export interface TraceReference { metric_key: string; label: string; year: number | null }
export interface TraceInput extends TraceReference {
  value: number | null; unit: "millions" | "percent" | "multiple" | "days" | "years";
  origin: "SOURCE" | "MANUAL" | "CALCULATED" | "DERIVED" | "CONVENTION";
  provider: string | null; source: string | null;
}
export interface TraceResponse extends TraceReference {
  value: number | null; unit: "millions" | "percent" | "multiple";
  formula: string; description: string; inputs: TraceInput[]; dependencies: TraceReference[];
  provenance: TraceInput[]; downstream_metrics: TraceReference[]; notes: string[];
}
export interface TraceRequest extends ModelCalculateRequest {
  metric_key: string; year?: number;
  historical_provenance: Partial<Record<HistoricalField, { origin: "SOURCE" | "MANUAL" | "DERIVED"; provider: string | null; source: string | null }>>;
}
