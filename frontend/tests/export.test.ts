import { test } from "node:test";
import assert from "node:assert/strict";
import { exportRequest, fetchWorkbook, downloadWorkbook, XLSX_MIME } from "../src/lib/export.ts";
import { DEFAULT_REQUEST, toForm } from "../src/lib/model-inputs.ts";
import type { CompanyResponse } from "../src/types/company.ts";

test("export uses current overrides, assumptions, grid, and optional company context", () => {
  const form = toForm(DEFAULT_REQUEST);
  form.historical.ebitda = "450";
  form.transaction_assumptions.debt_percentage = "60";
  const company = { company: { ticker: "EXAMPLE", company_name: "Example", currency: "EUR", provider: "fake" }, base_year: { fiscal_year: 2025 } } as CompanyResponse;
  const request = exportRequest(form, company);
  assert.equal(request.historical.ebitda, 450);
  assert.equal(request.transaction_assumptions.debt_percentage, 0.6);
  assert.equal(request.company?.currency, "EUR");
  assert.deepEqual(request.entry_multiples, [8,9,10,11,12]);
  assert.equal(exportRequest(form, null).company?.ticker, null);
  assert.ok(!("result" in request));
});
test("export fetch returns workbook Blob and server filename", async context => {
  const request = exportRequest(toForm(DEFAULT_REQUEST), null);
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.match(url, /model\/export$/);
    assert.deepEqual(JSON.parse(String(init.body)), request);
    return new Response(new Uint8Array([80,75,3,4]), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": 'attachment; filename="EXAMPLE_LBO_Model.xlsx"' } });
  });
  const file = await fetchWorkbook(request);
  assert.equal(file.filename, "EXAMPLE_LBO_Model.xlsx");
  assert.equal(file.blob.size, 4);
});
test("export errors remain visible and non-XLSX responses are rejected", async context => {
  const mock = context.mock.method(globalThis, "fetch", async () => Response.json({ detail: { message: "Invalid model" } }, { status: 400 }));
  await assert.rejects(fetchWorkbook(DEFAULT_REQUEST), /Invalid model/);
  mock.mock.mockImplementation(async () => Response.json({ error: "not a workbook" }));
  await assert.rejects(fetchWorkbook(DEFAULT_REQUEST), /unexpected file type/);
});
test("export filename falls back safely when no usable header is exposed", async context => {
  context.mock.method(globalThis, "fetch", async () => new Response("PK", { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": 'attachment; filename="../../bad.xlsx"' } }));
  assert.equal((await fetchWorkbook(DEFAULT_REQUEST)).filename, "LBO_Model.xlsx");
});
test("browser download creates, clicks, removes anchor and releases object URL", context => {
  let clicked = false, removed = false, appended = false;
  const anchor = { href: "", download: "", click() { clicked = true; }, remove() { removed = true; } };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor, body: { appendChild() { appended = true; } } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: (callback: () => void) => callback() } });
  context.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  });
  context.mock.method(URL, "createObjectURL", () => "blob:fixture");
  const revoke = context.mock.method(URL, "revokeObjectURL", () => {});
  downloadWorkbook(new Blob(["PK"]), "LBO_Model.xlsx");
  assert.ok(clicked && removed && appended);
  assert.equal(anchor.href, "blob:fixture");
  assert.equal(anchor.download, "LBO_Model.xlsx");
  assert.equal(revoke.mock.callCount(), 1);
});
