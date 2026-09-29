import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REQUEST, apiToDisplay, displayToApi, toForm, toRequest } from "../src/lib/model-inputs.ts";
import { formatCurrency, formatMultiple, formatPercent, formatSignedCurrency } from "../src/lib/format.ts";
import { calculateModel, ModelApiError } from "../src/lib/api.ts";

test("golden request survives the display conversion boundary", () => {
  const form = toForm(DEFAULT_REQUEST);
  assert.equal(form.transaction_assumptions.debt_percentage, "70");
  assert.equal(form.operating_assumptions.capex_pct_of_rev, "4");
  assert.deepEqual(toRequest(form), DEFAULT_REQUEST);
});
test("percentage conversion and edited assumptions use decimal API units", () => {
  assert.equal(displayToApi("70", "%"), 0.7);
  assert.equal(displayToApi("-2.5", "%"), -0.025);
  assert.equal(apiToDisplay(0.08, "%"), "8");
  const form = toForm(DEFAULT_REQUEST);
  form.transaction_assumptions.debt_percentage = "60.5";
  form.operating_assumptions.revenue_growth_rate = "-2";
  assert.equal(toRequest(form).transaction_assumptions.debt_percentage, 0.605);
  assert.equal(toRequest(form).operating_assumptions.revenue_growth_rate, -0.02);
  assert.equal(toRequest(form).historical.revenue, 1000);
});
test("blank, nonfinite and malformed inputs are rejected rather than treated as zero", () => {
  for (const value of ["", " ", "NaN", "Infinity", "1e999", "70%", "0xff", "12oops"]) {
    assert.throws(() => displayToApi(value, "%"));
  }
  const form = toForm(DEFAULT_REQUEST);
  form.historical.revenue = "";
  assert.throws(() => toRequest(form), /Revenue/);
});
test("formatting preserves signs and does not mutate source values", () => {
  assert.equal(formatCurrency(-168), "($168.0)");
  assert.equal(formatCurrency(3000, true), "$3,000.0M");
  assert.equal(formatPercent(0.1977441934779717), "19.8%");
  assert.equal(formatMultiple(2.465019564934513), "2.47x");
  assert.equal(formatSignedCurrency(20), "+$20.0M");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatCurrency(undefined), "—");
  assert.equal(formatCurrency(0), "$0.0");
});
test("API sends the exact request and surfaces structured validation errors", async (context) => {
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.match(url, /\/api\/v1\/model\/calculate$/);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), DEFAULT_REQUEST);
    return Response.json({ detail: [{ loc: ["body", "transaction_assumptions", "debt_percentage"], msg: "Must be less than 1" }] }, { status: 422 });
  });
  await assert.rejects(calculateModel(DEFAULT_REQUEST), /debt_percentage: Must be less than 1/);
});
test("API domain errors preserve useful backend messages", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ detail: { code: "financial_model_error", message: "Initial equity must be positive" } }, { status: 400 }));
  await assert.rejects(calculateModel(DEFAULT_REQUEST), /Initial equity must be positive/);
});
test("network errors are marked disconnected", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(calculateModel(DEFAULT_REQUEST), (error: unknown) => error instanceof ModelApiError && error.status === null);
});
test("unexpected server failures and malformed responses remain visible", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async () => new Response("Internal Server Error", { status: 500 }));
  await assert.rejects(calculateModel(DEFAULT_REQUEST), /unreadable response/);
  mock.mock.mockImplementation(async () => Response.json({ something: "else" }));
  await assert.rejects(calculateModel(DEFAULT_REQUEST), /unexpected model response/);
  mock.mock.mockImplementation(async () => Response.json({ transaction: {}, historical: {}, returns: {},
    historical_cogs_ratio: 0.6, projected_years: [1, 2, 3, 4, 5].map(year => ({ year })), diagnostics: [] }));
  await assert.rejects(calculateModel(DEFAULT_REQUEST), /unexpected model response/);
});
