// Use the jQuery Justified Gallery plugin for a Pic-Time style layout.
// IMAGE_PATHS is defined in index.html.
(function () {
  /**
   * Initialize the justified gallery using the jQuery plugin.
   * @param {string} rootId - DOM id for the gallery container.
   * @param {string[]} imagePaths - array of image URLs.
   */
  window.initJustifiedGallery = function (rootId, imagePaths) {
    const root = document.getElementById(rootId);
    if (!root) return;
    if (typeof window.jQuery === "undefined" || !jQuery.fn.justifiedGallery) {
      console.error("jQuery Justified Gallery plugin is not available.");
      return;
    }

    const $root = jQuery(root);
    $root.empty();

    // Populate with <a><img /></a> items from the provided paths
    imagePaths.forEach((src, index) => {
      const $a = jQuery("<a/>", { href: src, "data-index": index });
      const $img = jQuery("<img/>", {
        src,
        loading: "lazy",
        alt: ""
      });
      $a.append($img);
      $root.append($a);
    });

    // Initialize the plugin
    $root.justifiedGallery({
      rowHeight: 260,
      margins: 2,
      lastRow: "nojustify",
      border: 0,
      captions: false,
      waitThumbnailsLoad: true
    });

    // Simple lightbox/slideshow
    let currentIndex = 0;

    function ensureLightbox() {
      let overlay = document.querySelector(".lightbox-overlay");
      if (overlay) return overlay;

      overlay = document.createElement("div");
      overlay.className = "lightbox-overlay";
      overlay.innerHTML = `
        <div class="lightbox-backdrop"></div>
        <div class="lightbox-content" role="dialog" aria-modal="true">
          <button class="lightbox-prev" aria-label="Previous image">&#10094;</button>
          <button class="lightbox-next" aria-label="Next image">&#10095;</button>
          <div class="lightbox-image-wrapper">
            <img class="lightbox-image" alt="" />
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      return overlay;
    }

    function openLightbox(index) {
      const overlay = ensureLightbox();
      const imgEl = overlay.querySelector(".lightbox-image");
      currentIndex = (index + imagePaths.length) % imagePaths.length;
      imgEl.src = imagePaths[currentIndex];
      overlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      const overlay = document.querySelector(".lightbox-overlay");
      if (!overlay) return;
      overlay.classList.remove("is-open");
      document.body.style.overflow = "";
    }

    function showNext(delta) {
      openLightbox(currentIndex + delta);
    }

    // Selection & download
    const selected = new Set();
    let selecting = false;
    const selectToggle = document.getElementById("select-toggle");
    const downloadSelected = document.getElementById("download-selected");
    const downloadAll = document.getElementById("download-all");
    const countEl = document.getElementById("gallery-count");

    function updateToolbar() {
      selectToggle.textContent = selecting ? "Cancel" : "Select";
      downloadSelected.hidden = !selecting;
      downloadSelected.disabled = selected.size === 0;
      countEl.textContent = selecting
        ? `${selected.size} selected`
        : `${imagePaths.length} photos`;
    }

    function setSelecting(on) {
      selecting = on;
      selected.clear();
      root.classList.toggle("is-selecting", on);
      root.querySelectorAll("a.is-selected").forEach((a) => a.classList.remove("is-selected"));
      updateToolbar();
    }

    function fileName(src) {
      return decodeURIComponent(src.split("/").pop());
    }

    async function fetchBlob(src) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to fetch ${src}`);
      return res.blob();
    }

    function saveBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function download(paths, button) {
      if (!paths.length) return;
      const label = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        if (paths.length === 1) {
          saveBlob(await fetchBlob(paths[0]), fileName(paths[0]));
        } else {
          const zip = new JSZip();
          await Promise.all(
            paths.map(async (src) => zip.file(fileName(src), await fetchBlob(src)))
          );
          saveBlob(await zip.generateAsync({ type: "blob" }), "nana-berchie-gallery.zip");
        }
      } catch (err) {
        console.error("Download failed", err);
      } finally {
        button.textContent = label;
        button.disabled = false;
        updateToolbar();
      }
    }

    selectToggle.addEventListener("click", () => setSelecting(!selecting));
    downloadAll.addEventListener("click", () => download(imagePaths, downloadAll));
    downloadSelected.addEventListener("click", () => {
      const paths = [...selected].sort((a, b) => a - b).map((i) => imagePaths[i]);
      download(paths, downloadSelected);
    });
    updateToolbar();

    // Delegate clicks from thumbs
    root.addEventListener("click", (e) => {
      const anchor = e.target.closest("a");
      if (!anchor || !root.contains(anchor)) return;
      e.preventDefault();
      const index = parseInt(anchor.getAttribute("data-index") || "0", 10);
      if (selecting) {
        if (selected.has(index)) selected.delete(index);
        else selected.add(index);
        anchor.classList.toggle("is-selected", selected.has(index));
        updateToolbar();
        return;
      }
      openLightbox(index);
    });

    // Global handlers (created once)
    document.addEventListener("click", (e) => {
      const overlay = document.querySelector(".lightbox-overlay");
      if (!overlay || !overlay.classList.contains("is-open")) return;

      if (e.target.matches(".lightbox-backdrop")) {
        closeLightbox();
      } else if (e.target.matches(".lightbox-next") || e.target.closest(".lightbox-next")) {
        showNext(1);
      } else if (e.target.matches(".lightbox-prev") || e.target.closest(".lightbox-prev")) {
        showNext(-1);
      }
    });

    document.addEventListener("keydown", (e) => {
      const overlay = document.querySelector(".lightbox-overlay");
      if (!overlay || !overlay.classList.contains("is-open")) return;

      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowRight") {
        showNext(1);
      } else if (e.key === "ArrowLeft") {
        showNext(-1);
      }
    });
  };
})();

