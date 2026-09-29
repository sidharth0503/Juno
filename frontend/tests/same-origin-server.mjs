/** Local routing harness for the production build, not a Vercel runtime emulator.
 * Start Next on :3000 and FastAPI on :8000; run this script from frontend/.
 * Routes are read from the repository's real service rewrite configuration.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
const targets = { frontend: "http://localhost:3000", backend: "http://localhost:8000" };
function matches(source, pathname) {
  if (source === "/(.*)") return true;
  if (source.endsWith("/:path*")) {
    const prefix = source.slice(0, -"/:path*".length);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return source === pathname;
}
http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const route = config.rewrites.find(rule => matches(rule.source, pathname));
  const target = targets[route?.destination.service];
  if (!target) { response.writeHead(502); response.end("Unknown test service"); return; }
  const upstream = http.request(new URL(request.url, target), {
    method: request.method, headers: { ...request.headers, host: new URL(target).host },
  }, result => {
    const headers = { ...result.headers };
    for (const rule of config.headers ?? []) for (const header of rule.headers) headers[header.key.toLowerCase()] = header.value;
    response.writeHead(result.statusCode, headers);
    result.pipe(response);
  });
  upstream.setTimeout(60000, () => upstream.destroy(new Error("Upstream timeout")));
  upstream.on("error", error => {
    console.error("Test proxy:", error.message);
    if (!response.headersSent) response.writeHead(502);
    response.end("Local upstream unavailable");
  });
  request.pipe(upstream);
}).listen(4000, "127.0.0.1", () => console.log("Production-like routing harness: http://127.0.0.1:4000"));
