import type { ModelCalculateRequest } from "./model.ts";

export interface SensitivityRequest extends ModelCalculateRequest { entry_multiples?: number[]; exit_multiples?: number[] }
export interface SensitivityCell {
  entry_multiple: number; exit_multiple: number; irr: number | null; moic: number; exit_equity: number; ending_debt: number;
}
export interface SensitivityResponse {
  entry_multiples: number[]; exit_multiples: number[]; matrix: SensitivityCell[][];
  base_case: { entry_multiple: number; exit_multiple: number; row_index: number | null; column_index: number | null };
  warnings: string[];
}
