export function resolveApiUrl(configured: string | undefined, environment: string | undefined): string {
  return (configured ?? (environment === "production" ? "" : "http://localhost:8000")).trim().replace(/\/+$/, "");
}

// Next.js substitutes these public values at build time. Empty means same origin.
export const API_URL = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV);
