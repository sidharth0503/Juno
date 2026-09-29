import { test } from "node:test";
import assert from "node:assert/strict";
import { importHistorical, loadCompany, CompanyApiError } from "../src/lib/company.ts";
import { DEFAULT_REQUEST, toForm, toRequest } from "../src/lib/model-inputs.ts";
import { formatCurrency } from "../src/lib/format.ts";
import type { CompanyResponse, HistoricalPeriod } from "../src/types/company.ts";

const period = { ...DEFAULT_REQUEST.historical, fiscal_year: 2025, period_end: "2025-09-30",
  provenance: Object.fromEntries(Object.keys(DEFAULT_REQUEST.historical).map(k => [k, { status: "reported", source: k }])) } as HistoricalPeriod;
const fixture: CompanyResponse = { company: { ticker: "FIX", company_name: "Fixture Corp", exchange: null,
  currency: "EUR", sector: null, industry: null, latest_fiscal_period: "2025-09-30", provider: "fake" },
  historical_periods: [period], base_year: period, warnings: [], units: "millions" };

test("company import keeps millions, actual zero and missing values distinct", () => {
  const imported = importHistorical({ ...period, revenue: 416161, inventory: 0, cogs: null });
  assert.equal(imported.revenue, "416161");
  assert.equal(imported.inventory, "0");
  assert.equal(imported.cogs, "");
  const form = { ...toForm(DEFAULT_REQUEST), historical: imported };
  assert.throws(() => toRequest(form), /COGS/);
  form.historical.cogs = "240000";
  form.historical.ebitda = "150000";
  assert.equal(toRequest(form).historical.cogs, 240000);
  assert.equal(toRequest(form).historical.ebitda, 150000);
  assert.equal(toRequest(form).transaction_assumptions.debt_percentage, 0.7);
});

test("currency formatting never substitutes USD for EUR or unknown currency", () => {
  assert.equal(formatCurrency(10, true, "EUR"), "EUR 10.0M");
  assert.equal(formatCurrency(10, true, null), "10.0M");
});

test("company fetch normalizes ticker and accepts partial results", async context => {
  context.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "http://localhost:8000/api/v1/company/BRK-B");
    return Response.json({ ...fixture, base_year: { ...period, cogs: null } });
  });
  assert.equal((await loadCompany("http://localhost:8000", " brk-b ")).base_year.cogs, null);
});

test("company API exposes not-found and upstream failures", async context => {
  const mock = context.mock.method(globalThis, "fetch", async () => Response.json({ detail: { message: "Ticker not found" } }, { status: 404 }));
  await assert.rejects(loadCompany("http://local", "BAD"), (e: unknown) => e instanceof CompanyApiError && e.status === 404);
  mock.mock.mockImplementation(async () => Response.json({ detail: { message: "Service unavailable" } }, { status: 502 }));
  await assert.rejects(loadCompany("http://local", "BAD"), /Service unavailable/);
  mock.mock.mockImplementation(async () => { throw new TypeError("network"); });
  await assert.rejects(loadCompany("http://local", "BAD"), (e: unknown) => e instanceof CompanyApiError && e.status === null);
});

test("malformed company data cannot replace a valid form", async context => {
  const mock = context.mock.method(globalThis, "fetch", async () => Response.json({ ...fixture, units: "absolute" }));
  await assert.rejects(loadCompany("http://local", "FIX"), /unsupported response/);
  mock.mock.mockImplementation(async () => Response.json({ ...fixture, base_year: { ...period, revenue: "oops" } }));
  await assert.rejects(loadCompany("http://local", "FIX"), /unsupported response/);
});
