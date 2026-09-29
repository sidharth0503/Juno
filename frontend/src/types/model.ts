/** Mirrors backend/app/financial/models.py and backend/app/api/model.py. */
export interface HistoricalFinancials {
  revenue: number; cogs: number; ebitda: number; cash: number;
  accounts_receivable: number; inventory: number; accounts_payable: number;
  ppe: number; debt: number; shareholders_equity: number;
}
export interface TransactionAssumptions {
  purchase_multiple_ev_ebitda: number; debt_percentage: number;
  interest_rate: number; exit_multiple: number;
}
export interface OperatingAssumptions {
  revenue_growth_rate: number; ebitda_margin: number; tax_rate: number;
  dso_days: number; dio_days: number; dpo_days: number; capex_pct_of_rev: number;
}
export interface ModelCalculateRequest {
  historical: HistoricalFinancials;
  transaction_assumptions: TransactionAssumptions;
  operating_assumptions: OperatingAssumptions;
}
export interface TransactionSummary {
  purchase_enterprise_value: number; initial_debt: number; initial_equity: number;
}
export interface YearProjection {
  year: number; beginning_revenue: number; revenue: number; cogs: number; ebitda: number;
  beginning_ppe: number; capex: number; depreciation: number; ending_ppe: number;
  ebit: number; beginning_debt: number; interest_expense: number; ebt: number;
  taxes: number; net_income: number; accounts_receivable: number; inventory: number;
  accounts_payable: number; prior_nwc: number; nwc: number; change_in_nwc: number;
  cfads: number; mandatory_debt_paydown: number; optional_debt_paydown: number;
  ending_debt: number; beginning_cash: number; retained_cash_flow: number;
  ending_cash: number; beginning_equity: number; ending_equity: number;
  total_assets: number; total_liabilities: number; balance_check: number;
}
export interface ReturnsSummary {
  exit_enterprise_value: number; exit_debt: number; exit_equity: number;
  moic: number; irr: number | null;
}
export interface ModelDiagnostic {
  code: "negative_cash" | "simplified_balance_sheet_imbalance" | "non_computable_irr";
  year: number; message: string;
}
export interface ModelCalculateResponse {
  transaction: TransactionSummary; historical: HistoricalFinancials;
  historical_cogs_ratio: number; projected_years: YearProjection[];
  returns: ReturnsSummary; diagnostics: ModelDiagnostic[];
}
export const MODEL_TABS = [
  ["summary", "SUMMARY"], ["income", "INCOME STATEMENT"], ["cash", "CASH FLOW"],
  ["balance", "BALANCE SHEET"], ["debt", "DEBT SCHEDULE"], ["returns", "RETURNS / IRR"],
] as const;
export type ModelTab = typeof MODEL_TABS[number][0];
export type RequestStatus = "idle" | "calculating" | "ready" | "error";
