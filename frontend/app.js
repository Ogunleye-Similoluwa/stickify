(() => {
  "use strict";

  const config = window.STICKIFY_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = (params.get("api") || (isLocal ? "http://localhost:8080" : config.apiBase || "")).replace(/\/$/, "");

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const urlInput = $("url");
  const fileInput = $("file");
  const drop = $("drop");
  const dropTitle = $("drop-title");
  const seconds = $("seconds");
  const secondsOut = $("seconds-out");
  const start = $("start");
  const timing = $("timing");
  const submit = $("submit");
  const errorBox = $("error");
  const wakeNote = $("wake");
  const result = $("result");
  const preview = $("preview");
  const meta = $("meta");
  const download = $("download");
  const statusEl = $("status");
  const statusText = $("status-text");

  if (config.repoUrl) $("repo-link").href = config.repoUrl;

  let activeTab = "link";
  let objectUrl = null;

  // ----- server status (also wakes a sleeping free-tier server) -----
  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusText.textContent = text;
  }

  async function pingServer() {
    const slow = setTimeout(() => setStatus("waking", "Waking server…"), 2500);
    try {
      const res = await fetch(`${API}/api/health`, { cache: "no-store" });
      clearTimeout(slow);
      setStatus(res.ok ? "up" : "down", res.ok ? "Ready" : "Server issue");
      return res.ok;
    } catch {
      clearTimeout(slow);
      setStatus("down", "Server offline");
      return false;
    }
  }

  // ----- tabs -----
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      document.querySelectorAll(".pane").forEach((p) => { p.hidden = p.dataset.pane !== activeTab; });
      hideError();
    });
  });

  // ----- options -----
  const mode = () => form.querySelector('input[name="mode"]:checked').value;

  form.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener("change", () => {
      seconds.closest(".timing").querySelector(".timing-row").hidden = mode() === "static";
      seconds.hidden = mode() === "static";
    })
  );

  seconds.addEventListener("input", () => { secondsOut.textContent = `${seconds.value} s`; });

  // ----- file picking / drag and drop -----
  function showFileName() {
    const f = fileInput.files[0];
    dropTitle.textContent = f ? f.name : "Drop a GIF, video or image";
  }
  fileInput.addEventListener("change", () => { showFileName(); hideError(); });

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); })
  );
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      showFileName();
    }
  });

  // Pasting an X link anywhere on the page fills the link box.
  document.addEventListener("paste", (e) => {
    if (document.activeElement === urlInput) return;
    const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
    if (/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i.test(text.trim())) {
      document.querySelector('[data-tab="link"]').click();
      urlInput.value = text.trim();
    }
  });

  // ----- submit -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    let request;
    if (activeTab === "link") {
      const url = urlInput.value.trim();
      if (!url) return showError("Paste a link to an X post first.");
      request = fetch(`${API}/api/stickers/from-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          mode: mode(),
          seconds: Number(seconds.value),
          startSeconds: Number(start.value) || 0,
        }),
      });
    } else {
      const file = fileInput.files[0];
      if (!file) return showError("Choose a GIF, video or image first.");
      if (file.size > 25 * 1024 * 1024) return showError("That file is over 25 MB. Try a shorter clip.");
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode());
      body.append("seconds", seconds.value);
      body.append("start", String(Number(start.value) || 0));
      request = fetch(`${API}/api/stickers`, { method: "POST", body });
    }

    setLoading(true);
    const wakeTimer = setTimeout(() => { wakeNote.hidden = false; }, 6000);
    try {
      const res = await request;
      if (!res.ok) {
        let message = `Something went wrong (${res.status}).`;
        try { message = (await res.json()).message || message; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      showResult(blob, res.headers);
      setStatus("up", "Ready");
    } catch (err) {
      const offline = err instanceof TypeError;
      showError(offline
        ? "Couldn't reach the server. Check your connection and try again."
        : err.message);
      if (offline) setStatus("down", "Server offline");
    } finally {
      clearTimeout(wakeTimer);
      wakeNote.hidden = true;
      setLoading(false);
    }
  });

  function showResult(blob, headers) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    preview.src = objectUrl;
    download.href = objectUrl;
    const kind = headers.get("X-Sticker-Mode") === "static" ? "Still" : "Animated";
    const kb = Math.round(blob.size / 1024);
    meta.textContent = `${kind} · 512 × 512 · ${kb} KB · WebP`;
    result.hidden = false;
    if (window.matchMedia("(max-width: 860px)").matches) {
      result.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  $("again").addEventListener("click", () => {
    result.hidden = true;
    urlInput.value = "";
    fileInput.value = "";
    showFileName();
    (activeTab === "link" ? urlInput : drop).focus();
  });

  function setLoading(on) {
    submit.disabled = on;
    submit.classList.toggle("is-loading", on);
    submit.querySelector(".cta-label").textContent = on ? "Making sticker…" : "Make sticker";
  }
  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function hideError() { errorBox.hidden = true; }

  pingServer();
})();
