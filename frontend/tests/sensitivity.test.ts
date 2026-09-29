import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitivityRequest, sensitivityTone, calculateSensitivity } from "../src/lib/sensitivity.ts";
import { DEFAULT_REQUEST, toForm } from "../src/lib/model-inputs.ts";

test("sensitivity maps current form, manual overrides, percentages and default grids", () => {
  const form = toForm(DEFAULT_REQUEST);
  form.historical.ebitda = "450";
  form.transaction_assumptions.purchase_multiple_ev_ebitda = "9.5";
  form.operating_assumptions.revenue_growth_rate = "8";
  const request = sensitivityRequest(form);
  assert.equal(request.historical.ebitda, 450);
  assert.equal(request.transaction_assumptions.purchase_multiple_ev_ebitda, 9.5);
  assert.equal(request.operating_assumptions.revenue_growth_rate, 0.08);
  assert.deepEqual(request.entry_multiples, [8, 9, 10, 11, 12]);
  assert.deepEqual(request.exit_multiples, [8, 9, 10, 11, 12]);
});
test("heatmap threshold boundaries and nulls are presentation-only", () => {
  assert.equal(sensitivityTone(null), "heat-neutral");
  assert.equal(sensitivityTone(0.149), "heat-low");
  assert.equal(sensitivityTone(0.15), "heat-mid");
  assert.equal(sensitivityTone(0.2), "heat-mid");
  assert.equal(sensitivityTone(0.201), "heat-high");
});
test("sensitivity sends the current request and exposes service errors", async context => {
  const request = sensitivityRequest(toForm(DEFAULT_REQUEST));
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.match(url, /model\/sensitivity$/);
    assert.deepEqual(JSON.parse(String(init.body)), request);
    return Response.json({ detail: { message: "Scenario failure" } }, { status: 400 });
  });
  await assert.rejects(calculateSensitivity(request), /Scenario failure/);
});
test("sensitivity rejects transposed or malformed matrices", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ entry_multiples: [8, 9], exit_multiples: [10], matrix: [[]], base_case: {}, warnings: [] }));
  await assert.rejects(calculateSensitivity(DEFAULT_REQUEST), /Unexpected sensitivity response/);
});
