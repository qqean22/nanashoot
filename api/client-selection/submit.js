// Finalises the client's selection and records a snapshot for the photographer.

const { hasRole, send, readJson, loadData, saveData, sanitizeSelection, publicState, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
    if (!hasRole(req, "client")) return send(res, 401, { error: "Password required." });

    const data = await loadData();
    if (data.status === "submitted") {
      return send(res, 409, { error: "This selection has already been submitted.", state: publicState(data) });
    }

    const selection = sanitizeSelection(await readJson(req));
    if (!selection.selected.length) return send(res, 400, { error: "Please select at least one photo." });

    const now = new Date().toISOString();
    Object.assign(data, selection, { status: "submitted", updatedAt: now, submittedAt: now });
    data.submissions = [...(data.submissions || []), { submittedAt: now, ...selection }];
    await saveData(data);

    send(res, 200, publicState(data));
  });
