import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { example, evaluate } from "./model.ts";

// Exact allowlist, never expose a checkout directory or load .env. Loopback only.
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);
export function createLabServer() {
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? "")) { res.writeHead(403); res.end("Loopback host required"); return; }
    if (req.method !== "GET") { res.writeHead(405, { Allow: "GET" }); res.end("GET only"); return; }
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/example" || url.pathname === "/api/evaluate") {
        let data;
        try { data = url.pathname === "/api/example" ? example : evaluate(url.searchParams); }
        catch { res.writeHead(400); res.end("Invalid tutorial inputs"); return; }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      const asset = assets.get(url.pathname);
      if (!asset) { res.writeHead(404); res.end("Not found"); return; }
      const content = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { "Content-Type": asset[1] });
      res.end(content);
    } catch { res.writeHead(500); res.end("Could not load tutorial"); }
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) {
    throw new Error("Usage: node examples/selection-lab/server.ts [--port 4173]");
  }
  const port = args.length ? Number(args[1]) : 4173;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Port must be 1–65535");
  const server = createLabServer();
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`FinHOT synthetic tutorial: http://127.0.0.1:${port}\nNo API keys, database, collection or paid calls. Ctrl+C to stop.`));
}
