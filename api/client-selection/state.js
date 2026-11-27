// GET: current selection, notes and comment. PUT: autosave a draft.

const { hasRole, send, readJson, loadData, saveData, sanitizeSelection, publicState, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    const isClient = hasRole(req, "client");

    if (req.method === "GET") {
      if (!isClient && !hasRole(req, "admin")) return send(res, 401, { error: "Password required." });
      return send(res, 200, publicState(await loadData()));
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!isClient) return send(res, 401, { error: "Password required." });

      const data = await loadData();
      if (data.status === "submitted") {
        return send(res, 409, { error: "This selection has already been submitted.", state: publicState(data) });
      }

      Object.assign(data, sanitizeSelection(await readJson(req)), { updatedAt: new Date().toISOString() });
      await saveData(data);
      return send(res, 200, publicState(data));
    }

    send(res, 405, { error: "Method not allowed." });
  });
