(() => {
  "use strict";

  const config = window.STICKIFY_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = (params.get("api") || (isLocal ? "http://localhost:8080" : config.apiBase || "")).replace(/\/$/, "");

  const MAX_SECONDS = 10;   // WhatsApp's limit for animated stickers
  const MIN_SECONDS = 0.5;
  const STEP = 0.1;

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const urlInput = $("url");
  const loadBtn = $("load");
  const fileInput = $("file");
  const drop = $("drop");
  const dropTitle = $("drop-title");
  const submit = $("submit");
  const errorBox = $("error");
  const wakeNote = $("wake");
  const result = $("result");
  const preview = $("preview");
  const meta = $("meta");
  const download = $("download");
  const shareBtn = $("share");
  const shareHint = $("share-hint");
  const statusEl = $("status");
  const statusText = $("status-text");

  // preview + trimmer
  const clip = $("clip");
  const video = $("clip-video");
  const image = $("clip-image");
  const clipLoading = $("clip-loading");
  const badge = $("clip-badge");
  const trimWrap = $("trim-wrap");
  const trim = $("trim");
  const startRange = $("trim-start");
  const endRange = $("trim-end");
  const playhead = $("playhead");
  const startOut = $("start-out");
  const endOut = $("end-out");
  const lenOut = $("len-out");
  const startLabel = $("start-label");
  const endGroup = $("end-group");
  const lenGroup = $("len-group");
  const trimHint = $("trim-hint");

  if (config.repoUrl) $("repo-link").href = config.repoUrl;

  let activeTab = "link";
  let objectUrl = null;      // finished sticker
  let previewUrl = null;     // uploaded file preview
  let stickerFile = null;
  let resolvedLink = null;   // URL whose media is currently previewed
  let loadingLink = null;

  // Current clip: duration is null when unknown (then the server uses the whole clip, up to 10 s).
  const clipState = { kind: null, duration: null, start: 0, end: 0, playable: false };

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
    } catch {
      clearTimeout(slow);
      setStatus("down", "Server offline");
    }
  }

  // ----- helpers -----
  const mode = () => form.querySelector('input[name="mode"]:checked').value;
  const fmt = (s) => `${s.toFixed(1)} s`;
  const round = (s) => Math.round(s * 10) / 10;

  async function errorMessage(res) {
    let message = `Something went wrong (${res.status}).`;
    try { message = (await res.json()).message || message; } catch { /* not JSON */ }
    return message;
  }

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function hideError() { errorBox.hidden = true; }

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
      resetClip();
      if (activeTab === "upload" && fileInput.files[0]) previewFile(fileInput.files[0]);
      if (activeTab === "link" && urlInput.value.trim()) loadLink();
    });
  });

  // =====================================================================
  // Preview and trimming
  // =====================================================================

  function resetClip() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    image.hidden = true;
    image.removeAttribute("src");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    Object.assign(clipState, { kind: null, duration: null, start: 0, end: 0, playable: false });
    resolvedLink = null;
    badge.textContent = "";
    trimHint.textContent = "";
    clipLoading.hidden = true;
    trimWrap.hidden = true;
    clip.hidden = true;
  }

  function showLoading() {
    clip.hidden = false;
    clipLoading.hidden = false;
    video.hidden = true;
    image.hidden = true;
    trimWrap.hidden = true;
    badge.textContent = "";
    trimHint.textContent = "";
  }

  /** Sets up the trimmer once the clip length is known (or hides it when unknown). */
  function setDuration(kind, duration, playable) {
    clipState.kind = kind;
    clipState.playable = playable;
    clipState.duration = duration && isFinite(duration) && duration > 0 ? round(duration) : null;
    clipLoading.hidden = true;

    if (kind === "photo") {
      badge.textContent = "Photo";
      trimWrap.hidden = true;
      trimHint.textContent = "Photos become still stickers.";
      setMode("static", true);
      return;
    }
    lockMode(false);

    if (clipState.duration == null) {
      badge.textContent = kind === "gif" ? "GIF" : "Video";
      trimWrap.hidden = true;
      trimHint.textContent = `The sticker will use the whole clip, up to ${MAX_SECONDS} seconds.`;
      return;
    }

    const d = clipState.duration;
    clipState.start = 0;
    clipState.end = Math.min(d, MAX_SECONDS);
    for (const r of [startRange, endRange]) {
      r.max = String(d);
      r.step = String(STEP);
    }
    badge.textContent = `${kind === "gif" ? "GIF" : "Video"} · ${fmt(d)}`;
    trimWrap.hidden = false;
    playhead.hidden = !playable;
    applyRanges();
    updateTrimUi();
  }

  function applyRanges() {
    startRange.value = String(clipState.start);
    endRange.value = String(clipState.end);
  }

  function updateTrimUi() {
    const d = clipState.duration || 1;
    trim.style.setProperty("--s", String(clipState.start / d));
    trim.style.setProperty("--e", String(clipState.end / d));
    const still = mode() === "static";
    startLabel.textContent = still ? "Frame at" : "Start";
    startOut.textContent = fmt(clipState.start);
    endOut.textContent = fmt(clipState.end);
    lenOut.textContent = fmt(clipState.end - clipState.start);
    endRange.hidden = still;
    endGroup.hidden = still;
    lenGroup.hidden = still;
    trim.classList.toggle("is-still", still);
    if (still) {
      trimHint.textContent = "Drag to pick the frame for your sticker.";
    } else if (clipState.duration > MAX_SECONDS) {
      trimHint.textContent = `Drag the handles to choose up to ${MAX_SECONDS} seconds. The preview plays your selection.`;
    } else {
      trimHint.textContent = "The whole clip is selected. Drag the handles to cut it shorter.";
    }
  }

  function onStartInput() {
    const d = clipState.duration;
    let start = round(Number(startRange.value));
    if (mode() === "static") {
      clipState.start = Math.min(start, d);
    } else {
      start = Math.min(start, d - MIN_SECONDS);
      let end = clipState.end;
      if (end - start < MIN_SECONDS) end = start + MIN_SECONDS;
      if (end - start > MAX_SECONDS) end = start + MAX_SECONDS;
      clipState.start = Math.max(0, start);
      clipState.end = Math.min(round(end), d);
    }
    applyRanges();
    updateTrimUi();
    seekPreview(clipState.start);
  }

  function onEndInput() {
    const d = clipState.duration;
    let end = Math.max(round(Number(endRange.value)), MIN_SECONDS);
    let start = clipState.start;
    if (end - start < MIN_SECONDS) start = end - MIN_SECONDS;
    if (end - start > MAX_SECONDS) start = end - MAX_SECONDS;
    clipState.start = Math.max(0, round(start));
    clipState.end = Math.min(end, d);
    applyRanges();
    updateTrimUi();
    seekPreview(clipState.end);
  }

  startRange.addEventListener("input", onStartInput);
  endRange.addEventListener("input", onEndInput);
  ["change", "pointerup", "touchend"].forEach((ev) => {
    startRange.addEventListener(ev, resumeLoop);
    endRange.addEventListener(ev, resumeLoop);
  });

  // Keep the preview inside the selection so it shows exactly what the sticker will be.
  let scrubbing = false;
  function seekPreview(t) {
    if (!clipState.playable) return;
    scrubbing = true;
    video.pause();
    video.currentTime = t;
    setPlayhead(t);
  }
  function resumeLoop() {
    if (!clipState.playable) return;
    scrubbing = false;
    if (mode() === "static") return;
    video.currentTime = clipState.start;
    video.play().catch(() => {});
  }
  function setPlayhead(t) {
    if (clipState.duration) trim.style.setProperty("--p", String(t / clipState.duration));
  }

  function loopTick() {
    if (clipState.playable && !scrubbing && !video.paused && clipState.duration) {
      const t = video.currentTime;
      if (mode() !== "static" && (t >= clipState.end - 0.02 || t < clipState.start - 0.1)) {
        video.currentTime = clipState.start;
      }
      setPlayhead(video.currentTime);
    }
    requestAnimationFrame(loopTick);
  }
  requestAnimationFrame(loopTick);

  video.addEventListener("ended", () => { if (mode() !== "static") resumeLoop(); });

  function playVideo(src, kind, knownDuration) {
    video.hidden = false;
    image.hidden = true;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      video.hidden = true;
      setDuration(kind, knownDuration, false);
      if (knownDuration == null) trimHint.textContent = `Preview isn't available for this file, but it can still be converted. The sticker will use the whole clip, up to ${MAX_SECONDS} seconds.`;
    };
    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      const d = isFinite(video.duration) && video.duration > 0 ? video.duration : knownDuration;
      setDuration(kind, d, true);
      if (mode() === "static") seekPreview(clipState.start); else resumeLoop();
    };
    video.onerror = fail;
    video.src = src;
    video.load();
  }

  // ----- uploads -----
  async function previewFile(file) {
    resetClip();
    if (!file) return;
    showLoading();
    previewUrl = URL.createObjectURL(file);
    const type = file.type || "";
    if (type.startsWith("video/")) {
      playVideo(previewUrl, "video", null);
    } else if (type === "image/gif" || type === "image/webp") {
      image.src = previewUrl;
      image.hidden = false;
      const d = await animatedImageDuration(file);
      setDuration(d ? "gif" : type === "image/gif" ? "gif" : "photo", d, false);
    } else {
      image.src = previewUrl;
      image.hidden = false;
      setDuration("photo", null, false);
    }
  }

  /** Reads a GIF's total length where the browser supports ImageDecoder (Chrome, Edge, Android). */
  async function animatedImageDuration(file) {
    if (!("ImageDecoder" in window)) return null;
    try {
      const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
      await decoder.tracks.ready;
      const frames = Math.min(decoder.tracks.selectedTrack.frameCount, 3000);
      if (frames <= 1) { decoder.close(); return null; }
      let micros = 0;
      for (let i = 0; i < frames; i++) {
        const { image: frame } = await decoder.decode({ frameIndex: i });
        micros += frame.duration || 100000;
        frame.close();
      }
      decoder.close();
      return micros / 1e6;
    } catch {
      return null;
    }
  }

  function showFileName() {
    const f = fileInput.files[0];
    dropTitle.textContent = f ? f.name : "Drop a GIF, video or image";
  }
  fileInput.addEventListener("change", () => { showFileName(); hideError(); previewFile(fileInput.files[0]); });

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
      previewFile(fileInput.files[0]);
    }
  });

  // ----- X links -----
  const looksLikeXLink = (text) => /^https?:\/\/(www\.|mobile\.)?(x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/.+\/status/i.test(text);

  async function loadLink() {
    const url = urlInput.value.trim();
    if (!url) return showError("Paste a link to an X post first.");
    if (url === resolvedLink || url === loadingLink) return;
    hideError();
    resetClip();
    showLoading();
    loadingLink = url;
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading…";
    const wakeTimer = setTimeout(() => { wakeNote.hidden = false; }, 6000);
    try {
      const res = await fetch(`${API}/api/media/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const info = await res.json();
      if (urlInput.value.trim() !== url) return; // the link changed while loading
      resolvedLink = url;
      if (info.kind === "photo") {
        image.src = info.mediaUrl;
        image.hidden = false;
        setDuration("photo", null, false);
      } else {
        playVideo(info.mediaUrl, info.kind, info.durationSeconds);
      }
      setStatus("up", "Ready");
    } catch (err) {
      resetClip();
      showError(err instanceof TypeError
        ? "Couldn't reach the server. Check your connection and try again."
        : err.message);
    } finally {
      clearTimeout(wakeTimer);
      wakeNote.hidden = true;
      loadingLink = null;
      loadBtn.disabled = false;
      loadBtn.textContent = "Load";
    }
  }

  loadBtn.addEventListener("click", loadLink);
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); loadLink(); }
  });
  urlInput.addEventListener("input", () => {
    const v = urlInput.value.trim();
    if (v !== resolvedLink && resolvedLink) resetClip();
  });
  urlInput.addEventListener("paste", () => {
    setTimeout(() => { if (looksLikeXLink(urlInput.value.trim())) loadLink(); }, 0);
  });

  // Pasting an X link anywhere on the page fills the link box and loads it.
  document.addEventListener("paste", (e) => {
    if (document.activeElement === urlInput) return;
    const text = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
    if (looksLikeXLink(text)) {
      if (activeTab !== "link") document.querySelector('[data-tab="link"]').click();
      urlInput.value = text;
      loadLink();
    }
  });

  // ----- mode -----
  let modeLocked = false;
  function setMode(value, lock) {
    form.querySelector(`input[name="mode"][value="${value}"]`).checked = true;
    lockMode(!!lock);
    onModeChange();
  }
  function lockMode(lock) {
    modeLocked = lock;
    form.querySelectorAll('input[name="mode"]').forEach((r) => { r.disabled = lock && r.value !== "static"; });
  }
  function onModeChange() {
    if (clipState.duration != null) {
      updateTrimUi();
      if (mode() === "static") seekPreview(clipState.start); else resumeLoop();
    }
  }
  form.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", onModeChange));

  // =====================================================================
  // Converting
  // =====================================================================

  /** Start and length to send; nothing when unknown so the server uses the whole clip. */
  function timing() {
    if (clipState.duration == null) return {};
    if (mode() === "static") return { start: clipState.start };
    return { start: clipState.start, seconds: round(clipState.end - clipState.start) };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    const t = timing();

    let request;
    if (activeTab === "link") {
      const url = urlInput.value.trim();
      if (!url) return showError("Paste a link to an X post first.");
      const body = { url, mode: mode() };
      if (url === resolvedLink) {
        if (t.start != null) body.startSeconds = t.start;
        if (t.seconds != null) body.seconds = t.seconds;
      }
      request = () => fetch(`${API}/api/stickers/from-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      const file = fileInput.files[0];
      if (!file) return showError("Choose a GIF, video or image first.");
      if (file.size > 25 * 1024 * 1024) return showError("That file is over 25 MB. Try a shorter clip.");
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode());
      if (t.start != null) body.append("start", String(t.start));
      if (t.seconds != null) body.append("seconds", String(t.seconds));
      request = () => fetch(`${API}/api/stickers`, { method: "POST", body });
    }

    setLoading(true);
    const wakeTimer = setTimeout(() => { wakeNote.hidden = false; }, 6000);
    try {
      const res = await request();
      if (!res.ok) throw new Error(await errorMessage(res));
      showResult(await res.blob(), res.headers);
      setStatus("up", "Ready");
    } catch (err) {
      const offline = err instanceof TypeError;
      showError(offline ? "Couldn't reach the server. Check your connection and try again." : err.message);
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

    // Phones (and some desktop browsers) can hand the file straight to WhatsApp
    // through the system share menu.
    stickerFile = new File([blob], "sticker.webp", { type: "image/webp" });
    const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [stickerFile] });
    shareBtn.hidden = !canShare;
    shareHint.hidden = !canShare;

    result.hidden = false;
    if (window.matchMedia("(max-width: 860px)").matches) {
      result.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  shareBtn.addEventListener("click", async () => {
    if (!stickerFile) return;
    try {
      await navigator.share({ files: [stickerFile] });
    } catch (err) {
      if (err && err.name === "AbortError") return; // user closed the share menu
      showError("Sharing didn't work on this device. Download the sticker instead.");
    }
  });

  $("again").addEventListener("click", () => {
    result.hidden = true;
    urlInput.value = "";
    fileInput.value = "";
    showFileName();
    resetClip();
    lockMode(false);
    (activeTab === "link" ? urlInput : drop).focus();
  });

  function setLoading(on) {
    submit.disabled = on;
    submit.classList.toggle("is-loading", on);
    submit.querySelector(".cta-label").textContent = on ? "Making sticker…" : "Make sticker";
  }

  pingServer();
})();
