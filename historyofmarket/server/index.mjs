// ───────────────────────────────────────────────────────────────────────────
// History of Market — local BFF (backend-for-frontend)
//
// Zero dependencies (node:http only). Two jobs:
//
//   1. DATA  — serve the site's read-only open-JSON API from a local cache
//              (`server/cache/api/**`, seeded with all 117 datasets). On a
//              cache miss it transparently proxies the upstream origin and
//              persists the result, so the clone works online or offline.
//              Upstream numeric series are CC BY 4.0 — we forward the
//              attribution header on every response.
//
//   2. TUSHARE — proxy the user's paid Tushare Pro account without ever
//              exposing the token to the browser. Supports the HTTP query
//              form (`POST /tushare`), a REST-ish GET form, and a transparent
//              passthrough for the MCP streamable-HTTP endpoint.
//
// Env:
//   PORT             default 8787
//   UPSTREAM_ORIGIN  default https://historyofmarket.com
//   TUSHARE_URL      default https://t.xiaodefa.top/
//   TUSHARE_TOKEN    default the token supplied by the user
//   PROXY_UPSTREAM   "0" to disable outbound proxying (offline-only mode)
// ───────────────────────────────────────────────────────────────────────────

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = process.env.UPSTREAM_ORIGIN || "https://historyofmarket.com";
const TUSHARE_URL = process.env.TUSHARE_URL || "https://t.xiaodefa.top/";
const TUSHARE_TOKEN =
  process.env.TUSHARE_TOKEN ||
  "72f561d081a721405c3e2b5ee91d1bdad6da26077188b8a9051e8fca";
const PROXY_UPSTREAM = process.env.PROXY_UPSTREAM !== "0";

const CACHE = path.join(__dirname, "cache");
const API_CACHE = path.join(CACHE, "api");
const DIST = path.join(__dirname, "..", "web", "dist");

const MIME = {
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

// ASCII only: header values must be latin1-safe.
const CC_BY = 'CC-BY-4.0; attribution="History of Market (historyofmarket.com)"';

// ── helpers ────────────────────────────────────────────────────────────────

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
}

/** Resolve a URL pathname to an absolute file inside `root`, or null. */
function safeJoin(root, rel) {
  const clean = path
    .normalize(decodeURIComponent(rel))
    .replace(/^([/\\])+/, "");
  if (clean.split(path.sep).includes("..")) return null;
  const abs = path.join(root, clean);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

async function statFile(p) {
  try {
    const st = await fsp.stat(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

async function dirExists(p) {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Try `<p>`, `<p>.json`, `<p>/index.json` — the three shapes the site uses. */
async function resolveFile(base) {
  for (const cand of [base, base + ".json", path.join(base, "index.json")]) {
    const st = await statFile(cand);
    if (st) return { file: cand, st };
  }
  return null;
}

function etagOf(st) {
  return `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
}

function hashesOf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new Error("payload too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { "Content-Length": buf.length, ...headers });
  if (status !== 304) res.end(buf);
  else res.end();
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj, null, 2), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
}

// ── dataset serving ────────────────────────────────────────────────────────

async function serveDataset(req, res, relPath, { cacheDir = API_CACHE, upstreamPrefix = "/api/" } = {}) {
  const abs = safeJoin(cacheDir, relPath);
  if (!abs) return sendJson(res, 400, { error: "bad path" });

  const hit = await resolveFile(abs);
  if (hit) {
    const etag = etagOf(hit.st);
    if (req.headers["if-none-match"] === etag) {
      return send(res, 304, "", { ETag: etag, "X-License": CC_BY });
    }
    const buf = await fsp.readFile(hit.file);
    return send(res, 200, buf, {
      "Content-Type": mimeFor(hit.file),
      ETag: etag,
      "Cache-Control": "public, max-age=300",
      "X-License": CC_BY,
      "X-Data-Source": "local-cache",
    });
  }

  // cache miss → proxy upstream and persist
  if (PROXY_UPSTREAM) {
    const up = await proxyUpstream(relPath, upstreamPrefix);
    if (up) {
      // persist best-effort
      try {
        const savePath = up.filePath;
        await fsp.mkdir(path.dirname(savePath), { recursive: true });
        await fsp.writeFile(savePath, up.buf);
      } catch { /* read-only fs is fine */ }
      return send(res, 200, up.buf, {
        "Content-Type": "application/json; charset=utf-8",
        ETag: `W/"${hashesOf(up.buf).slice(0, 16)}"`,
        "Cache-Control": "public, max-age=300",
        "X-License": CC_BY,
        "X-Data-Source": "upstream",
      });
    }
  }

  return sendJson(res, 503, {
    status: "warming",
    message: "数据集未在本地缓存中，且无法回源。",
    path: relPath,
  });
}

async function proxyUpstream(relPath, prefix) {
  const candidates = [
    `${UPSTREAM}${prefix}${relPath}.json`,
    `${UPSTREAM}${prefix}${relPath}`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) continue;
      const rel = url.endsWith(".json") ? relPath + ".json" : relPath;
      return { buf, filePath: safeJoin(API_CACHE, rel) };
    } catch {
      continue;
    }
  }
  return null;
}

// ── tushare ────────────────────────────────────────────────────────────────

async function tushareQuery(params) {
  const body = JSON.stringify({ ...params, token: TUSHARE_TOKEN });
  const r = await fetch(TUSHARE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await r.text();
  try {
    return { status: r.status, data: JSON.parse(text) };
  } catch {
    return { status: r.status, data: { raw: text } };
  }
}

async function handleTushare(req, res, url) {
  // MCP streamable HTTP passthrough: /tushare/mcp
  if (url.pathname === "/tushare/mcp" || url.pathname.startsWith("/tushare/mcp/")) {
    const target = `https://t.xiaodefa.top/mcp${url.search ? url.search + "&" : "?"}token=${TUSHARE_TOKEN}`;
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    try {
      const r = await fetch(target, {
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] || "application/json",
          accept: req.headers["accept"] || "application/json, text/event-stream",
        },
        body,
      });
      const buf = Buffer.from(await r.arrayBuffer());
      return send(res, r.status, buf, {
        "Content-Type": r.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      });
    } catch (e) {
      return sendJson(res, 502, { error: "mcp proxy failed", detail: String(e) });
    }
  }

  // generic query
  let params;
  if (req.method === "POST") {
    const raw = await readBody(req);
    try {
      params = JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      const form = new URLSearchParams(raw.toString("utf8"));
      params = Object.fromEntries(form.entries());
    }
  } else {
    params = Object.fromEntries(url.searchParams.entries());
  }

  if (!params.api_name) {
    return sendJson(res, 400, {
      error: "missing api_name",
      usage: {
        post: 'POST /tushare  body: {"api_name":"trade_cal","exchange":"SSE"}',
        get: "GET /tushare/query?api_name=trade_cal&exchange=SSE",
        mcp: "POST /tushare/mcp  (streamable HTTP MCP)",
      },
    });
  }

  try {
    const { status, data } = await tushareQuery(params);
    return sendJson(res, status >= 400 ? status : 200, data, {
      "Cache-Control": "no-store",
      "X-Data-Source": "tushare-pro",
    });
  } catch (e) {
    return sendJson(res, 502, { error: "tushare request failed", detail: String(e) });
  }
}

// ── static (prod dist) ─────────────────────────────────────────────────────
//
// Serves `web/dist` when it exists. Extension-less paths (the site is
// path-addressed: /zh-cn/sp500/annual/) fall through to index.html so the
// client router can pick them up.

async function serveDist(req, res, url) {
  if (!(await dirExists(DIST))) return false;

  const abs = safeJoin(DIST, url.pathname);
  if (!abs) return false;

  let hit = await resolveFile(abs);
  if (!hit && !path.extname(abs)) {
    const idx = path.join(DIST, "index.html");
    const st = await statFile(idx);
    if (st) hit = { file: idx, st };
  }
  if (!hit) return false;

  const buf = await fsp.readFile(hit.file);
  send(res, 200, buf, {
    "Content-Type": mimeFor(hit.file),
    "Cache-Control": hit.file.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  return true;
}

// ── router ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  try {
    if (req.method === "OPTIONS") {
      return send(res, 204, "", {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type,if-none-match",
      });
    }

    // health / index
    if (p === "/healthz") {
      return sendJson(res, 200, {
        ok: true,
        upstream: UPSTREAM,
        proxy: PROXY_UPSTREAM,
        cache: API_CACHE,
        tushare: TUSHARE_URL,
      });
    }
    if (p === "/" && !fs.existsSync(DIST)) {
      return sendJson(res, 200, {
        service: "historyofmarket-clone BFF",
        roles: ["open-JSON dataset cache + upstream fallback", "Tushare Pro private proxy"],
        endpoints: ["/api/**", "/tushare", "/tushare/query", "/tushare/mcp", "/openapi.json", "/healthz"],
        note: "Frontend dev server: http://localhost:5173",
      });
    }

    // tushare proxy
    if (p === "/tushare" || p.startsWith("/tushare/")) {
      return await handleTushare(req, res, url);
    }

    // dataset API: /api/**
    if (p === "/api" || p.startsWith("/api/")) {
      const rel = p.replace(/^\/api\//, "");
      if (!rel) return sendJson(res, 200, { hint: "use /api/<dataset>.json" });
      return await serveDataset(req, res, rel, { cacheDir: API_CACHE, upstreamPrefix: "/api/" });
    }

    // root-level static companions (openapi.json, favicon.ico, site.webmanifest, llms.txt…)
    const rootHit = await resolveFile(safeJoin(CACHE, p) || "");
    if (rootHit) {
      const buf = await fsp.readFile(rootHit.file);
      return send(res, 200, buf, {
        "Content-Type": mimeFor(rootHit.file),
        ETag: etagOf(rootHit.st),
        "Cache-Control": "public, max-age=3600",
      });
    }

    // prod SPA
    if (await serveDist(req, res, url)) return;

    sendJson(res, 404, { error: "not found", path: p });
  } catch (e) {
    sendJson(res, 500, { error: "internal", detail: String(e && e.stack ? e.stack : e) });
  }
});

server.listen(PORT, () => {
  console.log(`[HOM-BFF] listening on http://localhost:${PORT}`);
  console.log(`[HOM-BFF] datasets  : ${API_CACHE}`);
  console.log(`[HOM-BFF] upstream  : ${PROXY_UPSTREAM ? UPSTREAM : "(disabled)"}`);
  console.log(`[HOM-BFF] tushare   : ${TUSHARE_URL}`);
});
