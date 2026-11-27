// Photographer view: GET returns everything incl. submission history.
// POST { action: "reopen" } lets the client edit a submitted selection again.

const { hasRole, send, readJson, loadData, saveData, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    if (!hasRole(req, "admin")) return send(res, 401, { error: "Admin password required." });

    if (req.method === "GET") return send(res, 200, await loadData());

    if (req.method === "POST") {
      const body = await readJson(req);
      if (body.action !== "reopen") return send(res, 400, { error: "Unknown action." });

      const data = await loadData();
      data.status = "draft";
      data.updatedAt = new Date().toISOString();
      await saveData(data);
      return send(res, 200, data);
    }

    send(res, 405, { error: "Method not allowed." });
  });
