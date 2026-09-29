import type { CompanyResponse } from "../types/company.ts";
import type { ExportRequest } from "../types/export.ts";
import type { ModelForm } from "./model-inputs.ts";
import { sensitivityRequest } from "./sensitivity.ts";
import { API_URL } from "./config.ts";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export function exportRequest(form: ModelForm, company: CompanyResponse | null): ExportRequest {
  return { ...sensitivityRequest(form), company: company ? {
    ticker: company.company.ticker, company_name: company.company.company_name, currency: company.company.currency,
    fiscal_year: company.base_year.fiscal_year, provider: company.company.provider,
  } : { ticker: null, company_name: null, currency: "USD", fiscal_year: null, provider: "Manual demo inputs" } };
}
export async function fetchWorkbook(request: ExportRequest, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_URL}/api/v1/model/export`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail?.message === "string" ? body.detail.message : `Export failed (${response.status}). Check model inputs and retry.`);
  }
  if (!response.headers.get("content-type")?.includes(XLSX_MIME)) throw new Error("The export service returned an unexpected file type.");
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The export service returned an empty workbook.");
  const suggested = /filename="([^"]+)"/i.exec(response.headers.get("content-disposition") ?? "")?.[1];
  const filename = suggested && /^[\w.-]+\.xlsx$/i.test(suggested) ? suggested : "LBO_Model.xlsx";
  return { blob, filename };
}
export function downloadWorkbook(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
