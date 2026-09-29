/** Optional local Chrome smoke test. Start the backend and built frontend first.
 * No browser automation package is required. Screenshots go outside the repo.
 * Run: node tests/browser-smoke.mjs <screenshot-directory>
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const output = path.resolve(process.argv[2] ?? path.join(tmpdir(), "lbo-terminal-verification"));
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "lbo-browser-"));
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let startupError;
browser.on("error", error => { startupError = error; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; }
    catch (error) { if (!["ENOENT", "EBUSY"].includes(error.code)) throw error; await pause(100); }
  }
  assert.ok(port, "Chrome debugging port is available");
  const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  const exportRequests = [];
  const apiRequests = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      clearTimeout(handler.timeout);
      if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
      else handler.resolve(message.result);
    }
    if (message.method === "Network.requestWillBeSent" && message.params.request.url.endsWith("/api/v1/model/export")) exportRequests.push(message.params.request);
    if (message.method === "Network.requestWillBeSent" && new URL(message.params.request.url).pathname.startsWith("/api/v1/")) apiRequests.push(message.params.request.url);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && message.params.request.url.endsWith("/api/v1/model/calculate")) requests.push(message.params.request);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function until(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(`UI wait failed: ${expression}`);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = (id, value) => evaluate(`(() => {
    const input = document.getElementById(${JSON.stringify(id)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const screenshot = async name => {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(output, name), Buffer.from(result.data, "base64"));
  };
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: frontendUrl });
  await until("document.querySelector('.status-bar')?.textContent.includes('MODEL: READY')");
  await evaluate("document.fonts.ready.then(() => true)");
  assert.ok(await evaluate("document.querySelector('.metric-strip').textContent.includes('19.8%')"));
  assert.ok(await evaluate("document.querySelector('.financial-table').textContent.includes('$32.0')"));
  assert.ok(await evaluate("document.querySelector('.diagnostic-details').textContent.includes('acquisition accounting')"));
  assert.equal(await evaluate("document.querySelector('.top-toolbar').getBoundingClientRect().height"), 48);
  assert.equal(await evaluate("document.querySelector('.model-sidebar').getBoundingClientRect().width"), 286);
  assert.equal(await evaluate("document.querySelector('.status-bar').getBoundingClientRect().height"), 28);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.financial-table')).fontSize"), "11px");
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.financial-table')).fontFamily.includes('JetBrains')"));
  assert.ok(await evaluate("document.querySelector('.model-sidebar').scrollWidth <= 286"));
  await screenshot("summary-1440.png");
  console.log("PASS: real API default result, golden values, warnings and 1440px shell dimensions");

  await send("Network.emulateNetworkConditions", { offline: false, latency: 700, downloadThroughput: -1, uploadThroughput: -1 });
  await click('[data-trace="ebitda"][data-year="5"]');
  await until("document.querySelector('.model-trace')?.textContent.includes('LOADING TRACE')");
  await until("document.querySelector('.trace-formula')?.textContent === 'Revenue × EBITDA Margin'");
  assert.ok(await evaluate("document.querySelector('.model-trace').textContent.includes('YEAR 5 EBITDA') && document.querySelector('.trace-result').textContent.includes('382.9')"));
  await screenshot("trace-ebitda.png");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('[aria-label="Close model trace"]');
  assert.equal(await evaluate("document.querySelector('.model-trace')"), null);
  await send("Network.setBlockedURLs", { urls: ["*/api/v1/model/trace"] });
  await click('[data-trace="irr"]');
  await until("document.querySelector('.trace-error') !== null");
  await send("Network.setBlockedURLs", { urls: [] });
  await click('.trace-error button');
  await until("document.querySelector('.trace-result')?.textContent.includes('19.8%')");
  await input("operating_assumptions-revenue_growth_rate", "6");
  await until("document.querySelector('.model-trace') === null");
  await input("operating_assumptions-revenue_growth_rate", "5");
  assert.equal(await evaluate("document.querySelector('.model-trace')"), null, "reverting an edit cannot reopen stale trace");
  await click('.terminal-button.primary');
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY')");
  console.log("PASS: trace opens, loading, golden EBITDA/formula, failure/retry, close and stale-state invalidation");

  for (const tab of ["income", "cash", "balance", "debt", "returns"]) {
    await click(`#tab-${tab}`);
    await until(`document.querySelector('#tab-${tab}').getAttribute('aria-selected') === 'true'`);
  }
  await until("document.querySelectorAll('.sensitivity-table').length === 2");
  assert.ok(await evaluate("!document.querySelector('.returns-view').textContent.includes('PREVIEW')"));
  assert.ok(await evaluate("document.querySelector('.matrix-reference').textContent.includes('19.8%')"));
  const preview = await evaluate("Array.from(document.querySelectorAll('.sensitivity-table')).map(t => t.textContent).join('')");
  await screenshot("returns-1440.png");
  console.log("PASS: all financial tabs and real sensitivity matrices");

  await input("transaction_assumptions-debt_percentage", "60");
  await until("document.querySelector('.stale-banner') !== null");
  assert.equal(await evaluate("document.querySelectorAll('.sensitivity-table').length"), 0);
  await click(".terminal-button.primary");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY') && document.querySelector('.metric-strip').textContent.includes('$1,800.0M')");
  assert.equal(JSON.parse(requests.at(-1).postData).transaction_assumptions.debt_percentage, 0.6);
  await until("document.querySelectorAll('.sensitivity-table').length === 2");
  assert.notEqual(await evaluate("Array.from(document.querySelectorAll('.sensitivity-table')).map(t => t.textContent).join('')"), preview);
  console.log("PASS: edits mark results stale, RUN MODEL sends 0.60, real outputs and sensitivity refresh");

  await input("transaction_assumptions-debt_percentage", "100");
  await click(".terminal-button.primary");
  await until("document.querySelector('.error-banner')?.textContent.includes('debt_percentage')");
  assert.ok(await evaluate("document.querySelector('.metric-strip').textContent.includes('$1,800.0M')"));
  await input("transaction_assumptions-debt_percentage", "");
  const count = requests.length;
  await click(".terminal-button.primary");
  await until("document.querySelector('.error-banner')?.textContent.includes('Enter a valid number')");
  assert.equal(requests.length, count);
  console.log("PASS: backend 422 and local parse errors are visible; last successful result preserved");

  await click(".text-button");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY') && document.querySelector('.metric-strip').textContent.includes('$2,100.0M')");
  assert.equal(await evaluate("document.getElementById('transaction_assumptions-debt_percentage').value"), "70");
  await click(".full-inputs summary");
  assert.ok(await evaluate("document.getElementById('historical-shareholders_equity').getBoundingClientRect().height > 0"));
  await click(".full-inputs summary");
  assert.ok(await evaluate("!document.querySelector('.export').disabled"));
  console.log("PASS: RESET, full historical inputs, and enabled export");

  await click(".export");
  await until("document.querySelector('.export-notice')?.textContent.includes('LBO_Model.xlsx')");
  assert.equal(JSON.parse(exportRequests.at(-1).postData).company.ticker, null);
  await send("Network.setBlockedURLs", { urls: ["*/api/v1/model/export"] });
  await click(".export");
  await until("document.querySelector('.export-error') !== null");
  assert.ok(await evaluate("document.querySelector('.status-bar').textContent.includes('MODEL: READY')"));
  await send("Network.setBlockedURLs", { urls: [] });
  await click(".export-error button");
  await until("document.querySelector('.export-notice') !== null && document.querySelector('.export-error') === null");
  console.log("PASS: manual workbook download, export failure isolation and retry");
  await input("operating_assumptions-ebitda_margin", "0");
  await click(".terminal-button.primary");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY') && document.querySelector('.metric-strip').textContent.includes('N/A')");
  assert.ok(await evaluate("document.querySelector('.returns-view').textContent.includes('EXIT EQUITY IS NONPOSITIVE')"));
  await click('[data-trace="irr"]');
  await until("document.querySelector('.model-trace')?.textContent.includes('Exit Equity <= 0')");
  assert.equal(await evaluate("document.querySelector('.trace-result').textContent"), "N/A");
  await click('[aria-label="Close model trace"]');
  await input("historical-ebitda", "0");
  await click(".terminal-button.primary");
  await until("document.querySelector('.error-banner')?.textContent.includes('Initial equity must be positive')");
  await click(".text-button");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY') && document.querySelector('.metric-strip').textContent.includes('19.8%')");
  console.log("PASS: non-computable IRR and backend domain errors render safely");

  await input("transaction_assumptions-purchase_multiple_ev_ebitda", "9");
  await input("transaction_assumptions-exit_multiple", "11");
  await click(".terminal-button.primary");
  await until("document.querySelector('.matrix-reference')?.dataset.entry === '9' && document.querySelector('.matrix-reference')?.dataset.exit === '11'");
  await input("transaction_assumptions-purchase_multiple_ev_ebitda", "9.5");
  await click(".terminal-button.primary");
  await until("document.querySelectorAll('.sensitivity-table').length === 2");
  assert.equal(await evaluate("document.querySelectorAll('.matrix-reference').length"), 0);
  await send("Network.setBlockedURLs", { urls: ["*/api/v1/model/sensitivity"] });
  await click(".terminal-button.primary");
  await until("document.querySelector('.sensitivity-error') !== null");
  assert.ok(await evaluate("document.querySelector('.status-bar').textContent.includes('MODEL: READY')"));
  assert.ok(await evaluate("!document.querySelector('.metric-strip').textContent.includes('—')"));
  await send("Network.setBlockedURLs", { urls: [] });
  await click(".sensitivity-error button");
  await until("document.querySelectorAll('.sensitivity-table').length === 2");
  await input("operating_assumptions-ebitda_margin", "0");
  await click(".terminal-button.primary");
  await until("document.querySelector('.sensitivity-table')?.textContent.includes('N/A')");
  await click(".text-button");
  await until("document.querySelector('.matrix-reference')?.textContent.includes('19.8%')");
  console.log("PASS: sensitivity current base highlighting, absent base, null IRR, failure isolation and retry");

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await click("#tab-summary");
  await pause(200);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 1280"));
  await screenshot("summary-1280.png");
  console.log("PASS: 1280px viewport without page-level horizontal overflow");

  await send("Network.setBlockedURLs", { urls: ["*/api/v1/*", "*/health"] });
  await click(".terminal-button.primary");
  await until("document.querySelector('.status-bar').textContent.includes('API: DISCONNECTED')");
  await screenshot("api-disconnected.png");
  await send("Page.reload");
  await until("document.querySelector('.status-bar')?.textContent.includes('API: DISCONNECTED')");
  assert.equal(await evaluate("document.getElementById('historical-revenue').value"), "1000");
  assert.ok(await evaluate("document.querySelector('.empty-workspace') !== null"));
  await send("Network.setBlockedURLs", { urls: [] });
  await click(".error-banner button");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY')");
  // Company fixtures intercept only company GETs. Model POSTs still use the real engine.
  const golden = JSON.parse(requests[0].postData).historical;
  const companyRequests = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    companyRequests.push(request.url);
    const ticker = decodeURIComponent(request.url.split("/").at(-1));
    const partial = ticker === "PARTIAL";
    const base = { ...golden, inventory: 0, cogs: partial ? null : 600, fiscal_year: 2025, period_end: "2025-09-30",
      provenance: Object.fromEntries(Object.keys(golden).map(key => [key, { status: partial && key === "cogs" ? "missing" : "reported", source: key }])) };
    const body = ticker === "BAD" ? { detail: { message: "Ticker not found" } } : ticker === "DOWN" ? { detail: { message: "Market data service unavailable" } } : {
      company: { ticker, company_name: ticker === "PARTIAL" ? "Partial Corp" : "Euro Corp", exchange: "TEST", currency: "EUR", sector: null, industry: null,
        latest_fiscal_period: "2025-09-30", provider: "fake" },
      base_year: base, historical_periods: [2023, 2024, 2025].map(year => ({ ...base, fiscal_year: year, period_end: `${year}-09-30` })),
      warnings: partial ? ["COGS unavailable for FY2025; manual input required."] : [], units: "millions",
    };
    void send("Fetch.fulfillRequest", { requestId, responseCode: ticker === "BAD" ? 404 : ticker === "DOWN" ? 502 : 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: new URL(frontendUrl).origin }],
      body: Buffer.from(JSON.stringify(body)).toString("base64") }).catch(error => errors.push(error.message));
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/company/*", requestStage: "Request" }] });
  await input("company-ticker", "PARTIAL");
  await pause(200);
  assert.equal(companyRequests.length, 0, "typing never fetches");
  const beforeLoad = requests.length;
  await click(".company-load");
  await until("document.querySelector('.ticker-context').textContent.includes('Partial Corp')");
  assert.equal(requests.length, beforeLoad, "LOAD does not calculate");
  assert.equal(await evaluate("document.getElementById('historical-cogs').value"), "");
  assert.equal(await evaluate("document.getElementById('historical-inventory').value"), "0");
  assert.ok(await evaluate("document.querySelector('.empty-workspace') !== null"), "old demo output cleared");
  assert.ok(await evaluate("document.getElementById('historical-cogs').closest('.assumption-row').textContent.includes('MISSING')"));
  assert.ok(await evaluate("document.getElementById('historical-ebitda').closest('.assumption-row').textContent.includes('SRC')"));
  assert.ok(await evaluate("document.querySelector('.table-unit').textContent.includes('EUR')"));
  await click(".terminal-button.primary");
  await until("document.querySelector('.error-banner')?.textContent.includes('COGS')");
  assert.equal(requests.length, beforeLoad);
  await input("historical-cogs", "650");
  await input("historical-ebitda", "310");
  assert.ok(await evaluate("document.getElementById('historical-ebitda').closest('.assumption-row').textContent.includes('MANUAL')"));
  await click(".terminal-button.primary");
  await until("document.querySelector('.status-bar').textContent.includes('MODEL: READY')");
  assert.equal(JSON.parse(requests.at(-1).postData).historical.cogs, 650);
  assert.equal(JSON.parse(requests.at(-1).postData).historical.ebitda, 310);
  await click('[data-trace="purchase_enterprise_value"]');
  await until("document.querySelector('.trace-result')?.textContent.includes('3,100.0')");
  assert.ok(await evaluate("document.querySelector('.model-trace dl').textContent.includes('MANUAL') && document.querySelector('.model-trace dl').textContent.includes('310.0')"));
  await click('[aria-label="Close model trace"]');
  console.log("PASS: trace uses current manual override with MANUAL provenance");
  assert.ok(await evaluate("document.querySelector('.metric-strip').textContent.includes('EUR') && !document.querySelector('.metric-strip').textContent.includes('$')"));
  await click(".export");
  await until("document.querySelector('.export-notice')?.textContent.includes('PARTIAL_LBO_Model.xlsx')");
  assert.equal(JSON.parse(exportRequests.at(-1).postData).historical.ebitda, 310);
  assert.equal(JSON.parse(exportRequests.at(-1).postData).historical.cogs, 650);
  assert.equal(JSON.parse(exportRequests.at(-1).postData).company.currency, "EUR");
  console.log("PASS: company export preserves manual overrides and currency");
  const successfulMetrics = await evaluate("document.querySelector('.metric-strip').textContent");
  for (const ticker of ["BAD", "DOWN"]) {
    await input("company-ticker", ticker);
    await click(".company-load");
    await until("document.querySelector('.company-error') !== null && !document.querySelector('.company-load').disabled");
    assert.ok(await evaluate("document.querySelector('.ticker-context').textContent.includes('Partial Corp')"));
    assert.equal(await evaluate("document.querySelector('.metric-strip').textContent"), successfulMetrics);
    assert.equal(await evaluate("document.getElementById('historical-cogs').value"), "650");
  }
  await input("operating_assumptions-revenue_growth_rate", "8");
  await click(".text-button");
  assert.equal(await evaluate("document.getElementById('operating_assumptions-revenue_growth_rate').value"), "5");
  assert.equal(await evaluate("document.getElementById('historical-cogs').value"), "650");
  await click(".company-history .terminal-button");
  await until("document.getElementById('historical-cogs').value === '' && !document.querySelector('.company-load').disabled");
  assert.ok(await evaluate("document.getElementById('historical-ebitda').closest('.assumption-row').textContent.includes('SRC')"));
  await input("company-ticker", "EURO");
  await click(".company-load");
  await until("document.querySelector('.ticker-context').textContent.includes('Euro Corp')");
  assert.equal(await evaluate("document.querySelector('.company-warnings')"), null);
  assert.equal(await evaluate("document.getElementById('historical-cogs').value"), "600");
  await click(".company-history details summary");
  assert.ok(await evaluate("document.querySelector('.company-history table').textContent.includes('FY2023')"));
  await screenshot("company-loaded-1280.png");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 1280"));
  console.log("PASS: company imports, missing vs zero, source/manual, override calculation, currencies, failed-load preservation, reset, reload, and replacement");
  assert.deepEqual(errors, []);
  if (process.env.EXPECT_SAME_ORIGIN === "1") {
    assert.ok(apiRequests.length > 0);
    assert.ok(apiRequests.every(url => new URL(url).origin === new URL(frontendUrl).origin), "all production API requests use the frontend origin");
    assert.deepEqual(await evaluate("fetch('/health').then(r => r.json())"), { status: "ok" });
    console.log("PASS: production build sends all API requests to the same origin; health responds through service routing");
  }
  console.log("PASS: network failure, recovery, and no uncaught browser exceptions");
  console.log(`Screenshots: ${output}`);
} finally {
  socket?.close();
  browser.kill();
}
