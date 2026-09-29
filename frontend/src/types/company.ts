import type { HistoricalFinancials } from "./model.ts";

export type HistoricalField = keyof HistoricalFinancials;
export type HistoricalPeriod = { [K in HistoricalField]: number | null } & {
  fiscal_year: number; period_end: string;
  provenance: Record<HistoricalField, { status: "reported" | "derived" | "missing"; source: string | null }>;
};
export interface CompanyResponse {
  company: { ticker: string; company_name: string | null; exchange: string | null; currency: string | null;
    sector: string | null; industry: string | null; latest_fiscal_period: string | null; provider: string };
  historical_periods: HistoricalPeriod[]; base_year: HistoricalPeriod; warnings: string[]; units: "millions";
}
