// Photographer view of the client's selection, notes and submissions.
(function () {
  const API = "/api/client-selection";
  const PHOTOS = "/client-selection/photos/";

  const $ = (id) => document.getElementById(id);
  let data = null;
  let photos = [];

  async function api(path, options = {}) {
    const res = await fetch(`${API}/${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  }

  function message(text) {
    $("cs-message").textContent = text;
  }

  async function load() {
    try {
      const [state, list] = await Promise.all([api("admin"), api("photos")]);
      data = state;
      photos = list.photos || [];
      $("cs-loading").hidden = true;
      $("cs-lock").hidden = true;
      $("cs-app").hidden = false;
      render();
    } catch (err) {
      $("cs-loading").hidden = err.status === 401;
      $("cs-loading").textContent = err.message;
      $("cs-app").hidden = true;
      $("cs-lock").hidden = err.status !== 401;
      if (err.status === 401) $("cs-password").focus();
    }
  }

  function row(name, note) {
    const li = document.createElement("li");
    li.className = "cs-admin-row";
    li.innerHTML = `<a target="_blank" rel="noreferrer"><img loading="lazy" alt="" /></a>
      <div><span class="cs-filename"></span><p class="cs-admin-note"></p></div>`;
    li.querySelector("a").href = PHOTOS + encodeURIComponent(name);
    li.querySelector("img").src = PHOTOS + encodeURIComponent(name);
    li.querySelector(".cs-filename").textContent = name + (photos.includes(name) ? "" : " (file no longer in folder)");
    li.querySelector(".cs-admin-note").textContent = note || "";
    return li;
  }

  function render() {
    const submitted = data.status === "submitted";
    const status = $("cs-status");
    status.textContent = submitted ? "Submitted" : "In progress";
    status.classList.toggle("is-submitted", submitted);

    $("cs-selected-count").textContent = `${data.selected.length} of ${photos.length}`;
    $("cs-submitted-at").textContent = formatDate(data.submittedAt);
    $("cs-updated-at").textContent = formatDate(data.updatedAt);
    $("cs-comment").textContent = data.comment || "—";
    $("cs-reopen").hidden = !submitted;

    const selectedList = $("cs-selected-list");
    selectedList.innerHTML = "";
    data.selected.forEach((name) => selectedList.appendChild(row(name, data.notes[name])));
    $("cs-selected-empty").hidden = data.selected.length > 0;

    const otherNotes = Object.keys(data.notes).filter((name) => !data.selected.includes(name));
    const otherList = $("cs-other-notes");
    otherList.innerHTML = "";
    otherNotes.forEach((name) => otherList.appendChild(row(name, data.notes[name])));
    $("cs-other-notes-block").hidden = otherNotes.length === 0;

    const history = $("cs-history");
    history.innerHTML = "";
    (data.submissions || [])
      .slice()
      .reverse()
      .forEach((s) => {
        const li = document.createElement("li");
        li.textContent = `${formatDate(s.submittedAt)} — ${s.selected.length} photos`;
        history.appendChild(li);
      });
    $("cs-history-block").hidden = !(data.submissions || []).length;
  }

  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  $("cs-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    $("cs-login-error").textContent = "";
    button.disabled = true;
    try {
      await api("login", {
        method: "POST",
        body: JSON.stringify({ password: $("cs-password").value, role: "admin" })
      });
      $("cs-password").value = "";
      await load();
    } catch (err) {
      $("cs-login-error").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });

  $("cs-refresh").addEventListener("click", () => {
    message("");
    load();
  });

  $("cs-copy").addEventListener("click", async () => {
    const text = data.selected.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      message(`Copied ${data.selected.length} filenames.`);
    } catch (e) {
      window.prompt("Copy the filenames below:", data.selected.join(", "));
    }
  });

  $("cs-csv").addEventListener("click", () => {
    const names = [...new Set([...data.selected, ...Object.keys(data.notes)])];
    const lines = [["filename", "selected", "note"].map(csvCell).join(",")];
    names.forEach((name) => {
      lines.push([name, data.selected.includes(name) ? "yes" : "no", data.notes[name]].map(csvCell).join(","));
    });
    if (data.comment) lines.push(["GENERAL COMMENTS", "", data.comment].map(csvCell).join(","));
    download(lines.join("\r\n"), `client-selection-${stamp()}.csv`, "text/csv;charset=utf-8");
  });

  $("cs-json").addEventListener("click", () => {
    download(JSON.stringify(data, null, 2), `client-selection-${stamp()}.json`, "application/json");
  });

  $("cs-reopen").addEventListener("click", async () => {
    if (!window.confirm("Unlock the selection so the client can make changes and submit again?")) return;
    try {
      data = await api("admin", { method: "POST", body: JSON.stringify({ action: "reopen" }) });
      render();
      message("Selection reopened. The client can now edit and resubmit.");
    } catch (err) {
      message(err.message);
    }
  });

  $("cs-logout").addEventListener("click", async () => {
    await api("logout", { method: "POST", body: JSON.stringify({ role: "admin" }) }).catch(() => {});
    $("cs-app").hidden = true;
    $("cs-lock").hidden = false;
  });

  load();
})();
