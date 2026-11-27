#!/usr/bin/env node
// Local preview server for the whole site, including the client selection
// page. Runs the same /api handlers used on Vercel and applies the same
// password check to /client-selection/photos as middleware.js.
//
//   CLIENT_SELECTION_PASSWORD=client-pass \
//   CLIENT_SELECTION_ADMIN_PASSWORD=admin-pass \
//   node client-selection/server.js

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8000;
process.chdir(ROOT);

const { hasRole } = require(path.join(ROOT, "api", "client-selection", "_lib.js"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function apiHandler(urlPath) {
  const m = urlPath.match(/^\/api\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)\/?$/i);
  if (!m || m[1].split("/").some((part) => part.startsWith("_"))) return null;
  const file = path.join(ROOT, "api", `${m[1]}.js`);
  return fs.existsSync(file) ? require(file) : null;
}

function withVercelHelpers(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };
}

function plain(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function serveStatic(req, res, urlPath) {
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return plain(res, 403, "Forbidden");

  const rel = path.relative(ROOT, filePath).split(path.sep);
  if (
    rel.some((part) => part.startsWith(".")) ||
    urlPath.startsWith("/client-selection/data") ||
    urlPath.startsWith("/client-selection/originals")
  ) {
    return plain(res, 404, "Not found");
  }
  if (urlPath.startsWith("/client-selection/photos/") && !hasRole(req, "client") && !hasRole(req, "admin")) {
    return plain(res, 401, "Password required.");
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      if (!urlPath.endsWith("/")) {
        res.writeHead(301, { Location: urlPath + "/" });
        return res.end();
      }
      filePath = path.join(filePath, "index.html");
    }
    fs.stat(filePath, (err2, stat2) => {
      if (err2 || !stat2.isFile()) return plain(res, 404, "Not found");
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Length": stat2.size
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let urlPath;
    try {
      urlPath = decodeURIComponent(url.pathname);
    } catch (e) {
      return plain(res, 400, "Bad request");
    }

    if (urlPath.startsWith("/api/")) {
      const handler = apiHandler(urlPath);
      if (!handler) return plain(res, 404, "Not found");
      withVercelHelpers(req, res, url);
      try {
        await handler(req, res);
      } catch (err) {
        console.error(err);
        if (!res.headersSent) plain(res, 500, "Server error");
      }
      return;
    }

    serveStatic(req, res, urlPath);
  })
  .listen(PORT, () => {
    console.log(`Serving site at http://localhost:${PORT}`);
    console.log(`Client selection: http://localhost:${PORT}/client-selection/`);
    console.log(`Photographer view: http://localhost:${PORT}/client-selection/admin.html`);
    if (!process.env.CLIENT_SELECTION_PASSWORD) {
      console.warn("Warning: CLIENT_SELECTION_PASSWORD is not set, so clients cannot sign in.");
    }
    if (!process.env.CLIENT_SELECTION_ADMIN_PASSWORD) {
      console.warn("Warning: CLIENT_SELECTION_ADMIN_PASSWORD is not set, so the photographer view is disabled.");
    }
  });
