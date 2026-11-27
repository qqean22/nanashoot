const { passwords, safeEqual, setSession, send, readJson, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });

    const body = await readJson(req);
    const role = body.role === "admin" ? "admin" : "client";
    const expected = passwords()[role];

    if (!expected) {
      return send(res, 503, {
        error: role === "admin" ? "Admin access is not configured." : "This gallery is not available yet."
      });
    }

    if (typeof body.password !== "string" || !safeEqual(body.password, expected)) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return send(res, 401, { error: "Incorrect password." });
    }

    setSession(req, res, role);
    send(res, 200, { ok: true, role });
  });
