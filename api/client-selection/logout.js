const { clearSession, send, readJson, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });

    const body = await readJson(req);
    clearSession(req, res, body.role === "admin" ? "admin" : "client");
    send(res, 200, { ok: true });
  });
