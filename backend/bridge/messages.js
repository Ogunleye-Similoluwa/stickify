// Pure helpers for the bridge, kept separate so they can be tested without WhatsApp.

/** Same alphabet as the server's HandoffStore: no 0/O or 1/I/L. */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const AFTER_WORD = /\bsticker\s*[:#-]?\s*([A-Za-z0-9]{5})\b/i;

const valid = (code) => [...code].every((c) => ALPHABET.includes(c));

/**
 * What a message asks for: { code } for "sticker AB3CD", { help: true } when it mentions stickers
 * without a usable code, or null when it isn't for us at all. A bare five-letter word is ignored,
 * since this is a normal number and friends may message it too.
 */
export function readRequest(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const match = text.match(AFTER_WORD);
  if (match) {
    const code = match[1].toUpperCase();
    if (valid(code)) return { code };
  }
  return /\bstickers?\b/i.test(text) ? { help: true } : null;
}

/** The text of a message, looking inside the wrappers WhatsApp uses for disappearing and edited messages. */
export function textOf(message) {
  let m = message;
  for (let i = 0; i < 3 && m; i++) {
    const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m?.conversation ?? m?.extendedTextMessage?.text ?? null;
}

/** Only one-to-one chats; never groups, channels or status updates. */
export function isPrivateChat(jid) {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

/** Animated WebP files carry an ANIM chunk. */
export function isAnimatedWebp(buffer) {
  return buffer.includes(Buffer.from("ANIM", "ascii"));
}

export const REPLIES = {
  saveTip: "Here's your sticker! Tap it, then tap Add to Favorites to keep it.",
  expired: "That code has expired or doesn't exist. Make the sticker again on Stickify and tap Send to WhatsApp.",
  help: "Hi! To get a sticker, make it on Stickify and tap Send to WhatsApp. It fills in a message like \"sticker AB3CD\" for you to send here.",
  failed: "Sorry, something went wrong sending your sticker. Please try again in a minute.",
};
