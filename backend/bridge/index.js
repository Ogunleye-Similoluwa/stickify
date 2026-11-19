// Stickify WhatsApp bridge: keeps a normal WhatsApp number linked (like WhatsApp Web) and answers
// "sticker CODE" messages with the sticker waiting on the Stickify server under that code.
import makeWASocket, { Browsers, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import { openAuthStore } from "./auth-store.js";
import { REPLIES, isAnimatedWebp, isPrivateChat, readRequest, textOf } from "./messages.js";

const API = `http://127.0.0.1:${process.env.PORT || 8080}`;
const SECRET = process.env.BRIDGE_SECRET || "";
const NUMBER = (process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "");
const AUTH_DIR = process.env.WA_AUTH_DIR || "/tmp/stickify-wa-auth";
const REDIS_URL = process.env.WA_REDIS_URL || "";

const log = pino({ level: process.env.BRIDGE_LOG_LEVEL || "info", base: { app: "wa-bridge" } });
const quiet = pino({ level: "warn" }); // Baileys' own logs are very chatty

if (!SECRET || !NUMBER) {
  log.error("BRIDGE_SECRET and WHATSAPP_NUMBER must be set");
  process.exit(1);
}

const headers = { "X-Bridge-Secret": SECRET };
const seen = new Set();
let connected = false;
let sock;
let authStore;

async function waitForServer() {
  for (;;) {
    try {
      const r = await fetch(`${API}/api/health`);
      if (r.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function fetchSticker(code) {
  const r = await fetch(`${API}/api/internal/handoff/${encodeURIComponent(code)}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`server answered ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function heartbeat() {
  if (!connected) return;
  try {
    await fetch(`${API}/api/internal/bridge/heartbeat`, { method: "POST", headers });
  } catch (e) {
    log.warn({ err: e.message }, "heartbeat failed");
  }
}

async function answer(msg) {
  const jid = msg.key.remoteJid;
  const request = readRequest(textOf(msg.message));
  const who = "…" + jid.split("@")[0].slice(-4);
  if (!request) {
    log.info(`Ignored a message from ${who} (no sticker code)`); // never reply to ordinary chats
    return;
  }
  await sock.readMessages([msg.key]).catch(() => {});
  if (request.help) {
    await sock.sendMessage(jid, { text: REPLIES.help });
    return;
  }
  log.info(`WhatsApp message from ${who}: code ${request.code}`);
  try {
    const sticker = await fetchSticker(request.code);
    if (!sticker) {
      await sock.sendMessage(jid, { text: REPLIES.expired });
      return;
    }
    await sock.sendMessage(jid, { sticker, isAnimated: isAnimatedWebp(sticker), mimetype: "image/webp" });
    await sock.sendMessage(jid, { text: REPLIES.saveTip });
    log.info(`Sent sticker ${request.code} to ${who}`);
  } catch (e) {
    log.warn({ err: e.message }, "Couldn't send the sticker");
    await sock.sendMessage(jid, { text: REPLIES.failed }).catch(() => {});
  }
}

async function start() {
  const { state, saveCreds, clear } = await authStore.load();
  let askedForCode = false;

  sock = makeWASocket({
    auth: state,
    logger: quiet,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // Not linked yet: ask WhatsApp for an 8-character code instead of showing a QR code.
    if (qr && !state.creds.registered && !askedForCode) {
      askedForCode = true;
      try {
        const code = await sock.requestPairingCode(NUMBER);
        log.info(`LINK CODE: ${code.slice(0, 4)}-${code.slice(4)}  (on the Stickify phone: WhatsApp > Linked devices > Link a device > Link with phone number instead)`);
      } catch (e) {
        log.warn({ err: e.message }, "Couldn't get a link code");
      }
    }
    if (connection === "open") {
      connected = true;
      log.info(`Linked to WhatsApp as ${NUMBER.slice(0, 3)}…${NUMBER.slice(-4)}; answering sticker codes`);
      heartbeat();
    }
    if (connection === "close") {
      connected = false;
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        log.warn("WhatsApp logged this device out; starting over with a new link code");
        await clear();
      } else {
        log.info({ status }, "WhatsApp connection closed; reconnecting");
      }
      setTimeout(() => start().catch((e) => log.error({ err: e.message }, "restart failed")), 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const id = msg.key?.id;
      if (!id || msg.key.fromMe || seen.has(id) || !isPrivateChat(msg.key.remoteJid)) continue;
      seen.add(id);
      if (seen.size > 1000) seen.delete(seen.values().next().value);
      answer(msg).catch((e) => log.warn({ err: e.message }, "Couldn't answer a message"));
    }
  });
}

authStore = await openAuthStore({ redisUrl: REDIS_URL, folder: AUTH_DIR, log });
await waitForServer();
setInterval(heartbeat, 30_000);
await start();
