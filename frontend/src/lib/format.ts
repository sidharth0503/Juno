const numberFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const missing = (value: number | null | undefined) => value == null || !Number.isFinite(value);
export function formatNumber(value: number | null | undefined): string {
  return missing(value) ? "—" : numberFormat.format(value!);
}
export function formatCurrency(value: number | null | undefined, millions = false, currency: string | null = "USD"): string {
  if (missing(value)) return "—";
  const prefix = currency === "USD" ? "$" : currency ? `${currency} ` : "";
  const amount = `${prefix}${numberFormat.format(Math.abs(value!))}${millions ? "M" : ""}`;
  return value! < 0 ? `(${amount})` : amount;
}
export function formatPercent(value: number | null | undefined): string {
  return missing(value) ? "—" : `${numberFormat.format(value! * 100)}%`;
}
export function formatMultiple(value: number | null | undefined): string {
  return missing(value) ? "—" : `${value!.toFixed(2)}x`;
}
export function formatSignedCurrency(value: number | null | undefined, currency: string | null = "USD"): string {
  return missing(value) ? "—" : `${value! > 0 ? "+" : ""}${formatCurrency(value, true, currency)}`;
}
export function formatDays(value: number | null | undefined): string {
  return missing(value) ? "—" : `${formatNumber(value)}d`;
}
