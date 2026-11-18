import { test } from "node:test";
import assert from "node:assert/strict";
import { readRequest, textOf, isPrivateChat, isAnimatedWebp } from "./messages.js";

test("reads the code after the word sticker", () => {
  assert.deepEqual(readRequest("sticker KTU5S"), { code: "KTU5S" });
  assert.deepEqual(readRequest("Sticker: ktu5s please"), { code: "KTU5S" });
});

test("ignores ordinary chat", () => {
  assert.equal(readRequest("hello there"), null);
  assert.equal(readRequest("there"), null);
  assert.equal(readRequest("KTU5S"), null);
  assert.equal(readRequest(""), null);
  assert.equal(readRequest(undefined), null);
});

test("offers help when stickers are mentioned without a valid code", () => {
  assert.deepEqual(readRequest("how do I get a sticker"), { help: true });
  assert.deepEqual(readRequest("sticker OOOOO"), { help: true });
});

test("finds text inside disappearing-message wrappers", () => {
  assert.equal(textOf({ conversation: "hi" }), "hi");
  assert.equal(textOf({ extendedTextMessage: { text: "sticker AAAAA" } }), "sticker AAAAA");
  assert.equal(textOf({ ephemeralMessage: { message: { extendedTextMessage: { text: "x" } } } }), "x");
  assert.equal(textOf(undefined), null);
});

test("only answers private chats", () => {
  assert.ok(isPrivateChat("2348000000000@s.whatsapp.net"));
  assert.ok(isPrivateChat("123456789@lid"));
  assert.ok(!isPrivateChat("123-456@g.us"));
  assert.ok(!isPrivateChat("status@broadcast"));
});

test("spots animated stickers", () => {
  assert.ok(isAnimatedWebp(Buffer.from("RIFF....WEBPVP8X..........ANIM....")));
  assert.ok(!isAnimatedWebp(Buffer.from("RIFF....WEBPVP8 ....")));
});
