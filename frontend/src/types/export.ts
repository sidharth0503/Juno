import type { SensitivityRequest } from "./sensitivity.ts";

export interface ExportRequest extends SensitivityRequest {
  company?: { ticker: string | null; company_name: string | null; currency: string | null; fiscal_year: number | null; provider: string | null };
}
