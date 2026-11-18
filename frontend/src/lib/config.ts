const DEFAULT_API = "https://stickify-api.onrender.com";
const DEFAULT_REPO = "https://github.com/Ogunleye-Similoluwa/stickify";

/**
 * Where the API lives. Precedence:
 * 1. `?api=` in the page URL (handy for testing another server)
 * 2. the local backend when the site itself runs on localhost
 * 3. `VITE_API_BASE` set at build time
 * 4. the production server
 */
function resolveApiBase(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const base = fromQuery || (isLocal ? "http://localhost:8080" : import.meta.env.VITE_API_BASE || DEFAULT_API);
  return base.replace(/\/$/, "");
}

export const API_BASE = resolveApiBase();
export const REPO_URL = import.meta.env.VITE_REPO_URL || DEFAULT_REPO;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The Android app that adds stickers straight to WhatsApp (WhatsApp only accepts them from an app on phones). */
export const ANDROID_APP_URL = "https://github.com/Ogunleye-Similoluwa/stickify/releases/latest/download/stickify.apk";
