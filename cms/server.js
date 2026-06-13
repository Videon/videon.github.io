#!/usr/bin/env node
"use strict";

const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const contentFile = path.join(rootDir, "content", "site.json");
const portfolioDir = path.join(rootDir, "assets", "portfolio");
const port = Number(process.env.PORT || 8130);
const requestedHost = process.env.HOST || "127.0.0.1";
const allowRemoteCms = process.env.ALLOW_REMOTE_CMS === "1";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (!allowRemoteCms && !loopbackHosts.has(requestedHost)) {
  console.error("Refusing to bind the CMS to a non-local host.");
  console.error("Use HOST=127.0.0.1 for local editing, or set ALLOW_REMOTE_CMS=1 only on a trusted private network.");
  process.exit(1);
}

const host = requestedHost;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value, null, 2), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function hostForUrl(value) {
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function isLoopbackOrigin(value, request) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:") return false;

    const requestHost = request.headers.host || `${hostForUrl(host)}:${port}`;
    const expectedOrigins = new Set([
      `http://${requestHost}`,
      `http://${hostForUrl(host)}:${port}`,
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      `http://[::1]:${port}`
    ]);

    return expectedOrigins.has(parsed.origin);
  } catch (error) {
    return false;
  }
}

function rejectUnsafeMutation(request, response) {
  const contentType = String(request.headers["content-type"] || "");
  if (!/^application\/json(?:;|$)/i.test(contentType)) {
    sendJson(response, 415, { ok: false, error: "Mutation requests must use application/json." });
    return true;
  }

  const origin = request.headers.origin;
  if (origin && !isLoopbackOrigin(origin, request)) {
    sendJson(response, 403, { ok: false, error: "Untrusted request origin." });
    return true;
  }

  const referer = request.headers.referer;
  if (!origin && referer && !isLoopbackOrigin(referer, request)) {
    sendJson(response, 403, { ok: false, error: "Untrusted request referer." });
    return true;
  }

  return false;
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const target = path.resolve(base, decoded.replace(/^\/+/, ""));
  const relative = path.relative(base, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

async function serveFile(response, filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const target = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const body = await fsp.readFile(target);
    send(response, 200, body, {
      "Content-Type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
  } catch (error) {
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

function readRequestBody(request, maxBytes = 75 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function validateContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Content must be a JSON object.");
  }
  if (!value.identity || typeof value.identity !== "object") {
    throw new Error("Content requires an identity object.");
  }
  if (!Array.isArray(value.menuSections)) {
    throw new Error("Content requires a menuSections array.");
  }
  if (!value.portfolio || !Array.isArray(value.portfolio.items)) {
    throw new Error("Content requires portfolio.items.");
  }
  if (!value.contact || typeof value.contact !== "object") {
    throw new Error("Content requires a contact object.");
  }
}

function sanitizeFileName(fileName) {
  const parsed = path.parse(fileName || "media");
  const base = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
  const ext = parsed.ext.toLowerCase();
  const allowed = new Set([".gif", ".jpg", ".jpeg", ".m4v", ".mov", ".mp4", ".png", ".webm", ".webp"]);
  if (!allowed.has(ext)) throw new Error("Unsupported media file type.");
  return `${base}-${Date.now()}${ext}`;
}

async function handleUpload(request, response) {
  const body = JSON.parse(await readRequestBody(request));
  const match = String(body.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Upload must provide a dataUrl.");

  const fileName = sanitizeFileName(body.fileName || body.filename);
  const target = path.join(portfolioDir, fileName);
  await fsp.mkdir(portfolioDir, { recursive: true });
  await fsp.writeFile(target, Buffer.from(match[2], "base64"));
  sendJson(response, 200, { path: `assets/portfolio/${fileName}` });
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${hostForUrl(host)}:${port}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (request.method === "GET" && pathname === "/api/content") {
      const body = await fsp.readFile(contentFile, "utf8");
      send(response, 200, body, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      return;
    }

    if (request.method === "PUT" && pathname === "/api/content") {
      if (rejectUnsafeMutation(request, response)) return;
      const body = await readRequestBody(request);
      const content = JSON.parse(body);
      validateContent(content);
      await fsp.mkdir(path.dirname(contentFile), { recursive: true });
      await fsp.writeFile(contentFile, `${JSON.stringify(content, null, 2)}\n`, "utf8");
      sendJson(response, 200, { ok: true, path: path.relative(rootDir, contentFile) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/upload") {
      if (rejectUnsafeMutation(request, response)) return;
      await handleUpload(request, response);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/site/")) {
      const sitePath = pathname.slice("/site/".length) || "index.html";
      const target = safeJoin(rootDir, sitePath);
      if (!target) {
        send(response, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      await serveFile(response, target);
      return;
    }

    if (request.method === "GET") {
      const cmsPath = pathname === "/" ? "index.html" : pathname;
      const target = safeJoin(__dirname, cmsPath);
      if (!target) {
        send(response, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      await serveFile(response, target);
      return;
    }

    send(response, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}

const server = http.createServer(handleRequest);
server.listen(port, host, () => {
  const displayHost = hostForUrl(host);
  const cmsUrl = `http://${displayHost}:${port}/`;
  const siteUrl = `http://${displayHost}:${port}/site/`;
  console.log(`CMS running at ${cmsUrl}`);
  console.log(`Preview running at ${siteUrl}`);
  console.log(`Editing ${path.relative(rootDir, contentFile)}`);
});
