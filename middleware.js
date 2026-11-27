// Vercel Routing Middleware. Only runs for the client selection photos;
// every other path on the site is unaffected (see `matcher`).
// Verifies the session cookies issued by api/client-selection/login.js.

export const config = {
  matcher: "/client-selection/photos/:path*"
};

const COOKIES = { client: "cs_client", admin: "cs_admin" };

function parseCookies(header) {
  const out = {};
  header.split(";").forEach((pair) => {
    const i = pair.indexOf("=");
    if (i < 0) return;
    try {
      out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
    } catch (e) {
      /* ignore malformed cookie */
    }
  });
  return out;
}

async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValid(token, role, passwords) {
  if (!token || !passwords[role]) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== role || !(Number(parts[1]) > Date.now())) return false;
  const key = `client-selection|${passwords.client}|${passwords.admin}`;
  return constantTimeEqual(parts[2], await hmacHex(key, `${parts[0]}.${parts[1]}`));
}

export default async function middleware(request) {
  const passwords = {
    client: process.env.CLIENT_SELECTION_PASSWORD || "",
    admin: process.env.CLIENT_SELECTION_ADMIN_PASSWORD || ""
  };
  const cookies = parseCookies(request.headers.get("cookie") || "");

  for (const role of ["client", "admin"]) {
    if (await isValid(cookies[COOKIES[role]], role, passwords)) {
      // Equivalent to `next()` from @vercel/functions: continue to the static file.
      return new Response(null, { headers: { "x-middleware-next": "1" } });
    }
  }

  return new Response("Password required.", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
}
