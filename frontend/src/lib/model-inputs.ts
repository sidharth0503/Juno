import type { ModelCalculateRequest } from "../types/model.ts";

export const DEFAULT_REQUEST: ModelCalculateRequest = {
  historical: { revenue: 1000, cogs: 600, ebitda: 300, cash: 50, accounts_receivable: 100,
    inventory: 80, accounts_payable: 60, ppe: 500, debt: 200, shareholders_equity: 470 },
  transaction_assumptions: { purchase_multiple_ev_ebitda: 10, debt_percentage: 0.7, interest_rate: 0.08, exit_multiple: 10 },
  operating_assumptions: { revenue_growth_rate: 0.05, ebitda_margin: 0.3, tax_rate: 0.25,
    dso_days: 45, dio_days: 60, dpo_days: 30, capex_pct_of_rev: 0.04 },
};
export type InputGroup = keyof ModelCalculateRequest;
export type ModelForm = { [G in InputGroup]: { [K in keyof ModelCalculateRequest[G]]: string } };
export interface InputDefinition {
  key: string; label: string; unit: "%" | "x" | "d" | "$M";
}
export const INPUT_FIELDS: Record<InputGroup, InputDefinition[]> = {
  transaction_assumptions: [
    { key: "purchase_multiple_ev_ebitda", label: "Purchase Multiple", unit: "x" },
    { key: "debt_percentage", label: "Debt Financing", unit: "%" },
    { key: "interest_rate", label: "Interest Rate", unit: "%" },
    { key: "exit_multiple", label: "Exit Multiple", unit: "x" },
  ],
  operating_assumptions: [
    { key: "revenue_growth_rate", label: "Revenue Growth", unit: "%" },
    { key: "ebitda_margin", label: "EBITDA Margin", unit: "%" },
    { key: "tax_rate", label: "Tax Rate", unit: "%" },
    { key: "dso_days", label: "DSO", unit: "d" },
    { key: "dio_days", label: "DIO", unit: "d" },
    { key: "dpo_days", label: "DPO", unit: "d" },
    { key: "capex_pct_of_rev", label: "CapEx / Revenue", unit: "%" },
  ],
  historical: [
    { key: "revenue", label: "Revenue", unit: "$M" },
    { key: "ebitda", label: "EBITDA", unit: "$M" },
    { key: "cash", label: "Cash", unit: "$M" },
    { key: "debt", label: "Debt", unit: "$M" },
    { key: "cogs", label: "COGS", unit: "$M" },
    { key: "accounts_receivable", label: "Accounts Receivable", unit: "$M" },
    { key: "inventory", label: "Inventory", unit: "$M" },
    { key: "accounts_payable", label: "Accounts Payable", unit: "$M" },
    { key: "ppe", label: "PP&E", unit: "$M" },
    { key: "shareholders_equity", label: "Shareholders Equity", unit: "$M" },
  ],
};

/** The sole display/API unit boundary. No financial-model formulas live here. */
export function displayToApi(value: string, unit: InputDefinition["unit"]): number {
  if (!value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    throw new Error("Enter a valid number");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Enter a finite number");
  return unit === "%" ? number / 100 : number;
}
export function apiToDisplay(value: number, unit: InputDefinition["unit"]): string {
  return String(unit === "%" ? value * 100 : value);
}
export function toForm(request: ModelCalculateRequest): ModelForm {
  return Object.fromEntries(Object.entries(INPUT_FIELDS).map(([group, fields]) => [group,
    Object.fromEntries(fields.map(field => [field.key, apiToDisplay(
      (request[group as InputGroup] as unknown as Record<string, number>)[field.key], field.unit,
    )])),
  ])) as ModelForm;
}
export function toRequest(form: ModelForm): ModelCalculateRequest {
  return Object.fromEntries(Object.entries(INPUT_FIELDS).map(([group, fields]) => [group,
    Object.fromEntries(fields.map(field => {
      try {
        return [field.key, displayToApi((form[group as InputGroup] as Record<string, string>)[field.key], field.unit)];
      } catch (error) {
        throw new Error(`${field.label}: ${error instanceof Error ? error.message : "Invalid input"}`);
      }
    })),
  ])) as unknown as ModelCalculateRequest;
}
