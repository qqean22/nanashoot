// Client photo selection: password gate, selection, notes, autosave & submit.
(function () {
  const API = "/api/client-selection";
  const PHOTOS = "/client-selection/photos/";
  const SAVE_DELAY = 700;

  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $("cs-loading"),
    lock: $("cs-lock"),
    login: $("cs-login"),
    password: $("cs-password"),
    loginError: $("cs-login-error"),
    app: $("cs-app"),
    submitted: $("cs-submitted"),
    submittedDate: $("cs-submitted-date"),
    count: $("cs-count"),
    grid: $("cs-grid"),
    empty: $("cs-empty"),
    comment: $("cs-comment"),
    barCount: $("cs-bar-count"),
    saveStatus: $("cs-save-status"),
    submit: $("cs-submit"),
    confirm: $("cs-confirm"),
    confirmText: $("cs-confirm-text"),
    lightbox: $("cs-lightbox")
  };

  let photos = [];
  const selected = new Set();
  const notes = {};
  let locked = false;
  let filter = "all";
  let saveTimer = null;
  let saving = false;
  let dirty = false;

  // ---------- API ----------

  async function api(path, options = {}) {
    const res = await fetch(`${API}/${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function payload() {
    return JSON.stringify({ selected: [...selected], notes, comment: els.comment.value });
  }

  // ---------- Boot ----------

  async function boot() {
    try {
      const [list, state] = await Promise.all([api("photos"), api("state")]);
      photos = list.photos || [];
      applyState(state);
      showApp();
    } catch (err) {
      if (err.status === 401) showLock();
      else showFatal(err.message === "Request failed" ? "This page is not available right now." : err.message);
    }
  }

  function showLock() {
    els.loading.hidden = true;
    els.app.hidden = true;
    els.lock.hidden = false;
    els.password.focus();
  }

  function showFatal(message) {
    els.lock.hidden = true;
    els.app.hidden = true;
    els.loading.hidden = false;
    els.loading.textContent = message;
  }

  function showApp() {
    els.loading.hidden = true;
    els.lock.hidden = true;
    els.app.hidden = false;
    renderGrid();
    render();
  }

  els.login.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = els.login.querySelector("button");
    els.loginError.textContent = "";
    if (!els.password.value) {
      els.loginError.textContent = "Please enter your password.";
      return;
    }
    button.disabled = true;
    try {
      await api("login", { method: "POST", body: JSON.stringify({ password: els.password.value }) });
      els.password.value = "";
      els.lock.hidden = true;
      els.loading.hidden = false;
      await boot();
    } catch (err) {
      els.loginError.textContent = err.message;
      els.password.select();
    } finally {
      button.disabled = false;
    }
  });

  function applyState(state) {
    selected.clear();
    (state.selected || []).forEach((name) => selected.add(name));
    Object.keys(notes).forEach((k) => delete notes[k]);
    Object.assign(notes, state.notes || {});
    els.comment.value = state.comment || "";
    locked = state.status === "submitted";
    if (locked && state.submittedAt) {
      els.submittedDate.textContent = `on ${new Date(state.submittedAt).toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short"
      })}`;
    }
  }

  // ---------- Rendering ----------

  function renderGrid() {
    els.grid.innerHTML = "";
    const frag = document.createDocumentFragment();

    photos.forEach((name, index) => {
      const card = document.createElement("figure");
      card.className = "cs-card";
      card.dataset.name = name;
      card.dataset.index = index;
      card.innerHTML = `
        <div class="cs-frame">
          <button type="button" class="cs-thumb"><img loading="lazy" decoding="async" alt="" /></button>
          <button type="button" class="cs-check" aria-pressed="false">&#10003;</button>
        </div>
        <figcaption class="cs-caption">
          <span class="cs-filename"></span>
          <span class="cs-card-actions">
            <button type="button" class="gallery-action cs-select-text"></button>
            <button type="button" class="gallery-action cs-note-toggle" aria-expanded="false"></button>
          </span>
        </figcaption>
        <div class="cs-note" hidden>
          <label class="cs-visually-hidden"></label>
          <textarea class="cs-textarea" rows="3" maxlength="2000"
            placeholder="Notes or editing instructions for this photo…"></textarea>
        </div>`;

      const img = card.querySelector("img");
      img.addEventListener("load", () => img.classList.add("is-loaded"));
      img.src = PHOTOS + encodeURIComponent(name);

      card.querySelector(".cs-thumb").setAttribute("aria-label", `View ${name} larger`);
      card.querySelector(".cs-filename").textContent = name;
      card.querySelector(".cs-filename").title = name;

      const noteId = `cs-note-${index}`;
      const textarea = card.querySelector("textarea");
      textarea.id = noteId;
      textarea.value = notes[name] || "";
      card.querySelector(".cs-note label").setAttribute("for", noteId);
      card.querySelector(".cs-note label").textContent = `Note for ${name}`;
      card.querySelector(".cs-note").hidden = !notes[name];

      frag.appendChild(card);
    });

    els.grid.appendChild(frag);
  }

  function renderCard(card) {
    const name = card.dataset.name;
    const isSelected = selected.has(name);
    const hasNote = Boolean((notes[name] || "").trim());
    const noteOpen = !card.querySelector(".cs-note").hidden;

    card.classList.toggle("is-selected", isSelected);
    card.classList.toggle("is-locked", locked);

    const check = card.querySelector(".cs-check");
    check.setAttribute("aria-pressed", String(isSelected));
    check.setAttribute("aria-label", `${isSelected ? "Deselect" : "Select"} ${name}`);
    check.disabled = locked;

    const selectText = card.querySelector(".cs-select-text");
    selectText.textContent = isSelected ? "Selected" : "Select";
    selectText.setAttribute("aria-pressed", String(isSelected));
    selectText.disabled = locked;

    const noteToggle = card.querySelector(".cs-note-toggle");
    noteToggle.textContent = noteOpen ? "Hide note" : hasNote ? "View note" : "Add note";
    noteToggle.classList.toggle("has-note", hasNote && !noteOpen);
    noteToggle.setAttribute("aria-expanded", String(noteOpen));
    noteToggle.hidden = locked && !hasNote;

    card.querySelector("textarea").readOnly = locked;
    card.hidden = !matchesFilter(name);
  }

  function matchesFilter(name) {
    if (filter === "selected") return selected.has(name);
    if (filter === "notes") return Boolean((notes[name] || "").trim());
    return true;
  }

  function render() {
    els.grid.querySelectorAll(".cs-card").forEach(renderCard);

    const count = selected.size;
    els.count.textContent = `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;
    els.barCount.textContent = `${count} of ${photos.length} selected`;
    els.submitted.hidden = !locked;
    els.comment.readOnly = locked;
    els.submit.hidden = locked;
    els.submit.disabled = count === 0;

    const visible = els.grid.querySelectorAll(".cs-card:not([hidden])").length;
    els.empty.hidden = visible > 0;
    if (!photos.length) els.empty.textContent = "No photos have been added yet. Please check back soon.";
    else if (filter === "selected") els.empty.textContent = "You haven't selected any photos yet.";
    else els.empty.textContent = "No photos have notes yet.";

    document.querySelectorAll(".cs-filters [data-filter]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.filter === filter));
    });

    if (locked) setSaveStatus("Submitted — view only");
    renderLightbox();
  }

  // ---------- Saving ----------

  function setSaveStatus(text, isError) {
    els.saveStatus.textContent = text;
    els.saveStatus.classList.toggle("is-error", Boolean(isError));
  }

  function scheduleSave() {
    if (locked) return;
    dirty = true;
    setSaveStatus("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    clearTimeout(saveTimer);
    if (!dirty || locked) return;
    if (saving) {
      saveTimer = setTimeout(save, SAVE_DELAY);
      return;
    }
    saving = true;
    dirty = false;
    try {
      await api("state", { method: "PUT", body: payload() });
      if (!dirty) setSaveStatus("All changes saved");
    } catch (err) {
      dirty = true;
      if (err.status === 409 && err.data && err.data.state) {
        applyState(err.data.state);
        dirty = false;
        renderGrid();
        render();
      } else if (err.status === 401) {
        setSaveStatus("Your session expired. Please reload the page.", true);
      } else {
        setSaveStatus(`Not saved: ${err.message}. Retrying…`, true);
        saveTimer = setTimeout(save, 4000);
      }
    } finally {
      saving = false;
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (!dirty || locked) return;
    fetch(`${API}/state`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: payload(),
      keepalive: true
    });
    e.preventDefault();
    e.returnValue = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });

  // ---------- Interactions ----------

  function toggleSelected(name) {
    if (locked) return;
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    render();
    scheduleSave();
  }

  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".cs-card");
    if (!card) return;
    const name = card.dataset.name;

    if (e.target.closest(".cs-check, .cs-select-text")) {
      toggleSelected(name);
    } else if (e.target.closest(".cs-thumb")) {
      openLightbox(photos.indexOf(name));
    } else if (e.target.closest(".cs-note-toggle")) {
      const note = card.querySelector(".cs-note");
      note.hidden = !note.hidden;
      renderCard(card);
      if (!note.hidden && !locked) card.querySelector("textarea").focus();
    }
  });

  els.grid.addEventListener("input", (e) => {
    if (!e.target.matches(".cs-note textarea")) return;
    const card = e.target.closest(".cs-card");
    notes[card.dataset.name] = e.target.value;
    if (!e.target.value.trim()) delete notes[card.dataset.name];
    scheduleSave();
  });

  els.grid.addEventListener("focusout", (e) => {
    if (!e.target.matches(".cs-note textarea")) return;
    renderCard(e.target.closest(".cs-card"));
    save();
  });

  els.comment.addEventListener("input", scheduleSave);
  els.comment.addEventListener("blur", save);

  document.querySelector(".cs-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    render();
  });

  // ---------- Submit ----------

  els.submit.addEventListener("click", () => {
    if (!selected.size || locked) return;
    const n = selected.size;
    els.confirmText.textContent = `You're about to submit ${n} ${n === 1 ? "photo" : "photos"} for editing.`;
    if (typeof els.confirm.showModal === "function") {
      els.confirm.returnValue = "";
      els.confirm.showModal();
    } else if (window.confirm(`${els.confirmText.textContent} Submit now?`)) {
      submitSelection();
    }
  });

  els.confirm.addEventListener("close", () => {
    if (els.confirm.returnValue === "confirm") submitSelection();
  });

  async function submitSelection() {
    clearTimeout(saveTimer);
    els.submit.disabled = true;
    els.submit.textContent = "Submitting…";
    try {
      const state = await api("submit", { method: "POST", body: payload() });
      dirty = false;
      applyState(state);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err.status === 409 && err.data && err.data.state) {
        applyState(err.data.state);
        render();
      } else {
        setSaveStatus(`Couldn't submit: ${err.message}`, true);
      }
    } finally {
      els.submit.textContent = "Submit selection";
      els.submit.disabled = locked || selected.size === 0;
    }
  }

  // ---------- Lightbox ----------

  const lb = {
    img: els.lightbox.querySelector(".lightbox-image"),
    name: els.lightbox.querySelector(".cs-lightbox-name"),
    select: els.lightbox.querySelector(".cs-lightbox-select"),
    index: -1
  };

  function visibleIndexes() {
    return photos.map((name, i) => (matchesFilter(name) ? i : -1)).filter((i) => i >= 0);
  }

  function openLightbox(index) {
    if (index < 0) return;
    lb.index = index;
    els.lightbox.classList.add("is-open");
    els.lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderLightbox();
  }

  function closeLightbox() {
    lb.index = -1;
    els.lightbox.classList.remove("is-open");
    els.lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function stepLightbox(delta) {
    const list = visibleIndexes();
    if (!list.length) return closeLightbox();
    const pos = list.indexOf(lb.index);
    lb.index = list[(pos + delta + list.length) % list.length];
    renderLightbox();
  }

  function renderLightbox() {
    if (lb.index < 0) return;
    const name = photos[lb.index];
    const src = PHOTOS + encodeURIComponent(name);
    if (lb.img.getAttribute("src") !== src) lb.img.src = src;
    lb.img.alt = name;
    lb.name.textContent = name;
    const isSelected = selected.has(name);
    lb.select.textContent = isSelected ? "Selected" : "Select";
    lb.select.classList.toggle("is-selected", isSelected);
    lb.select.setAttribute("aria-pressed", String(isSelected));
    lb.select.disabled = locked;
  }

  els.lightbox.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeLightbox();
    else if (e.target.closest(".lightbox-next")) stepLightbox(1);
    else if (e.target.closest(".lightbox-prev")) stepLightbox(-1);
    else if (e.target.closest(".cs-lightbox-select")) toggleSelected(photos[lb.index]);
  });

  document.addEventListener("keydown", (e) => {
    if (lb.index < 0) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") stepLightbox(1);
    else if (e.key === "ArrowLeft") stepLightbox(-1);
  });

  let touchX = null;
  els.lightbox.addEventListener("touchstart", (e) => {
    touchX = e.touches.length === 1 ? e.touches[0].clientX : null;
  });
  els.lightbox.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  });

  boot();
})();
