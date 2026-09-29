"use client";
import { createContext, useContext } from "react";
import { formatCurrency as currency, formatSignedCurrency as signed } from "./format";

export const CurrencyContext = createContext<string | null>("USD");
export function useCurrency() {
  const code = useContext(CurrencyContext);
  return {
    currencyLabel: `${code ?? "Currency unknown"} (millions)`,
    formatCurrency: (value: number | null | undefined, millions = false) => currency(value, millions, code),
    formatSignedCurrency: (value: number | null | undefined) => signed(value, code),
  };
}
