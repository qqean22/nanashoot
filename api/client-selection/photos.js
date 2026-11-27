// Lists the client selection photos from client-selection/photos/manifest.json,
// which is written by client-selection/prepare-photos.js. Reading the manifest
// (rather than the folder) keeps the photos out of this function's bundle.

const fs = require("fs");
const path = require("path");
const { hasRole, send, handle } = require("./_lib");

module.exports = (req, res) =>
  handle(res, async () => {
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed." });
    if (!hasRole(req, "client") && !hasRole(req, "admin")) {
      return send(res, 401, { error: "Password required." });
    }

    let photos = [];
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "client-selection", "photos", "manifest.json"), "utf8")
      );
      photos = (manifest.photos || []).filter((name) => typeof name === "string" && !/[\\/]/.test(name));
    } catch (e) {
      photos = [];
    }

    send(res, 200, { photos });
  });
