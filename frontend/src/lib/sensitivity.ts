import type { SensitivityRequest, SensitivityResponse } from "../types/sensitivity.ts";
import { API_URL } from "./config.ts";
import { toRequest, type ModelForm } from "./model-inputs.ts";

export const DEFAULT_MULTIPLES = [8, 9, 10, 11, 12];
export function sensitivityRequest(form: ModelForm): SensitivityRequest {
  return { ...toRequest(form), entry_multiples: [...DEFAULT_MULTIPLES], exit_multiples: [...DEFAULT_MULTIPLES] };
}
export function sensitivityTone(irr: number | null): string {
  return irr === null ? "heat-neutral" : irr < 0.15 ? "heat-low" : irr <= 0.2 ? "heat-mid" : "heat-high";
}
export async function calculateSensitivity(request: SensitivityRequest, signal?: AbortSignal): Promise<SensitivityResponse> {
  const response = await fetch(`${API_URL}/api/v1/model/sensitivity`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail?.message === "string" ? body.detail.message : `Sensitivity request failed (${response.status}).`);
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (!body || !Array.isArray(body.entry_multiples) || !Array.isArray(body.exit_multiples)
      || !body.entry_multiples.length || !body.exit_multiples.length
      || !body.entry_multiples.every(finite) || !body.exit_multiples.every(finite)
      || !Array.isArray(body.matrix) || body.matrix.length !== body.entry_multiples.length
      || !body.base_case || !Array.isArray(body.warnings)
      || !body.matrix.every((row: unknown, r: number) => Array.isArray(row) && row.length === body.exit_multiples.length
        && row.every((cell: unknown, c: number) => {
          if (typeof cell !== "object" || cell === null) return false;
          const v = cell as Record<string, unknown>;
          return v.entry_multiple === body.entry_multiples[r] && v.exit_multiple === body.exit_multiples[c]
            && (v.irr === null || finite(v.irr)) && [v.moic, v.exit_equity, v.ending_debt].every(finite);
        }))) throw new Error("Unexpected sensitivity response.");
  return body as SensitivityResponse;
}
