// Shared helpers for the password-protected client selection page.
// Files prefixed with "_" are not exposed as Vercel functions.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const COOKIES = { client: "cs_client", admin: "cs_admin" };
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_KEY = "client-selection:data";
const DATA_FILE = path.join(process.cwd(), "client-selection", "data", "selections.json");

const MAX_PHOTOS = 5000;
const MAX_NOTE = 2000;
const MAX_COMMENT = 5000;

function passwords() {
  return {
    client: process.env.CLIENT_SELECTION_PASSWORD || "",
    admin: process.env.CLIENT_SELECTION_ADMIN_PASSWORD || ""
  };
}

// Sessions are signed with the configured passwords, so changing a password
// signs everyone out. middleware.js verifies the same token format.
function signingKey() {
  const p = passwords();
  return `client-selection|${p.client}|${p.admin}`;
}

function sign(payload) {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createToken(role) {
  const payload = `${role}.${Date.now() + SESSION_MS}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token, role) {
  if (!token || !passwords()[role]) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3 || parts[0] !== role) return false;
  if (!(Number(parts[1]) > Date.now())) return false;
  return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`));
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((pair) => {
    const i = pair.indexOf("=");
    if (i < 0) return;
    const key = pair.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(pair.slice(i + 1).trim());
    } catch (e) {
      out[key] = pair.slice(i + 1).trim();
    }
  });
  return out;
}

function hasRole(req, role) {
  return verifyToken(parseCookies(req)[COOKIES[role]], role);
}

function isSecure(req) {
  return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket && req.socket.encrypted);
}

function appendCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  const list = existing ? [].concat(existing) : [];
  list.push(value);
  res.setHeader("Set-Cookie", list);
}

function setSession(req, res, role) {
  const parts = [
    `${COOKIES[role]}=${encodeURIComponent(createToken(role))}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isSecure(req)) parts.push("Secure");
  appendCookie(res, parts.join("; "));
}

function clearSession(req, res, role) {
  const parts = [`${COOKIES[role]}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isSecure(req)) parts.push("Secure");
  appendCookie(res, parts.join("; "));
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// ---------- Storage ----------
// Uses Upstash Redis (Vercel KV / Upstash integration) when configured,
// otherwise a local JSON file for development.

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const { url, token } = redisConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Storage request failed (${res.status})`);
  return json.result;
}

class StorageError extends Error {}

function emptyData() {
  return {
    status: "draft",
    selected: [],
    notes: {},
    comment: "",
    updatedAt: null,
    submittedAt: null,
    submissions: []
  };
}

async function loadData() {
  let raw = null;
  if (redisConfig()) {
    raw = await redis(["GET", STORE_KEY]);
  } else if (process.env.VERCEL) {
    throw new StorageError("Storage is not configured. Connect an Upstash Redis store to this project.");
  } else if (fs.existsSync(DATA_FILE)) {
    raw = fs.readFileSync(DATA_FILE, "utf8");
  }
  return raw ? { ...emptyData(), ...JSON.parse(raw) } : emptyData();
}

async function saveData(data) {
  const json = JSON.stringify(data, null, 2);
  if (redisConfig()) {
    await redis(["SET", STORE_KEY, json]);
    return;
  }
  if (process.env.VERCEL) {
    throw new StorageError("Storage is not configured. Connect an Upstash Redis store to this project.");
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Validation ----------

function isFileName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 255 && !/[\\/]/.test(name);
}

function sanitizeSelection(input) {
  const src = input && typeof input === "object" ? input : {};
  const selected = [...new Set(Array.isArray(src.selected) ? src.selected.filter(isFileName) : [])].slice(
    0,
    MAX_PHOTOS
  );
  const notes = {};
  if (src.notes && typeof src.notes === "object") {
    Object.keys(src.notes)
      .slice(0, MAX_PHOTOS)
      .forEach((name) => {
        const text = typeof src.notes[name] === "string" ? src.notes[name].trim().slice(0, MAX_NOTE) : "";
        if (isFileName(name) && text) notes[name] = text;
      });
  }
  const comment = typeof src.comment === "string" ? src.comment.trim().slice(0, MAX_COMMENT) : "";
  return { selected, notes, comment };
}

function publicState(data) {
  return {
    status: data.status,
    selected: data.selected,
    notes: data.notes,
    comment: data.comment,
    updatedAt: data.updatedAt,
    submittedAt: data.submittedAt
  };
}

async function handle(res, fn) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof SyntaxError) return send(res, 400, { error: "Invalid request." });
    if (err instanceof StorageError) return send(res, 503, { error: err.message });
    console.error("[client-selection]", err);
    send(res, 500, { error: "Something went wrong. Please try again." });
  }
}

module.exports = {
  COOKIES,
  passwords,
  safeEqual,
  hasRole,
  setSession,
  clearSession,
  send,
  readJson,
  loadData,
  saveData,
  sanitizeSelection,
  publicState,
  handle
};
