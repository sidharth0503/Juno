import { API_URL } from "./config.ts";
import type { ModelCalculateRequest, ModelCalculateResponse, YearProjection } from "../types/model.ts";

const projectionFields = [
  "year", "beginning_revenue", "revenue", "cogs", "ebitda", "beginning_ppe", "capex",
  "depreciation", "ending_ppe", "ebit", "beginning_debt", "interest_expense", "ebt",
  "taxes", "net_income", "accounts_receivable", "inventory", "accounts_payable",
  "prior_nwc", "nwc", "change_in_nwc", "cfads", "mandatory_debt_paydown",
  "optional_debt_paydown", "ending_debt", "beginning_cash", "retained_cash_flow",
  "ending_cash", "beginning_equity", "ending_equity", "total_assets", "total_liabilities", "balance_check",
] as const satisfies readonly (keyof YearProjection)[];

export class ModelApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message); this.name = "ModelApiError"; this.status = status;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorMessage(body: unknown, status: number): string {
  const detail = record(body) ? body.detail : null;
  if (Array.isArray(detail)) return detail.map(item => {
    if (!record(item)) return "Invalid input";
    const path = Array.isArray(item.loc) ? item.loc.filter(part => part !== "body").join(" → ") : "Input";
    return `${path}: ${String(item.msg ?? "Invalid value")}`;
  }).join("; ");
  if (record(detail) && typeof detail.message === "string") return detail.message;
  if (typeof detail === "string") return detail;
  return status >= 500 ? "The calculation service encountered an error. Please retry." : `Calculation rejected (HTTP ${status}).`;
}
export async function calculateModel(request: ModelCalculateRequest, signal?: AbortSignal): Promise<ModelCalculateResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/model/calculate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request), signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ModelApiError("Cannot reach the calculation API. Start the local backend and run the model again.", null);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ModelApiError(`The API returned an unreadable response (HTTP ${response.status}).`, response.status); }
  if (!response.ok) throw new ModelApiError(errorMessage(body, response.status), response.status);
  // Guard the display boundary rather than allowing a malformed response to crash tables.
  const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const numericObject = (value: unknown, keys: readonly string[]) => record(value) && keys.every(key => finiteNumber(value[key]));
  if (!record(body) || !numericObject(body.transaction, ["purchase_enterprise_value", "initial_debt", "initial_equity"])
      || !numericObject(body.historical, Object.keys(request.historical)) || !finiteNumber(body.historical_cogs_ratio)
      || !record(body.returns) || !Array.isArray(body.projected_years) || body.projected_years.length !== 5
      || !body.projected_years.every((year, index) => numericObject(year, projectionFields) && year.year === index + 1)
      || !Array.isArray(body.diagnostics)
      || !body.diagnostics.every(d => record(d) && typeof d.code === "string" && typeof d.message === "string" && typeof d.year === "number")
      || !numericObject(body.returns, ["exit_enterprise_value", "exit_debt", "exit_equity", "moic"])
      || !(body.returns.irr === null || finiteNumber(body.returns.irr))) {
    throw new ModelApiError("The API returned an unexpected model response.", response.status);
  }
  return body as unknown as ModelCalculateResponse;
}
