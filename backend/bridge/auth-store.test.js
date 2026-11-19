import { test } from "node:test";
import assert from "node:assert/strict";
import { useRedisAuthState } from "./auth-store.js";

/** Tiny in-memory stand-in for the few Redis calls the store uses. */
function fakeRedis() {
  const hashes = new Map();
  const h = (k) => hashes.get(k) ?? hashes.set(k, new Map()).get(k);
  return {
    hGet: async (k, f) => h(k).get(f) ?? null,
    hSet: async (k, f, v) => { h(k).set(f, v); },
    hDel: async (k, f) => { h(k).delete(f); },
    del: async (k) => { hashes.delete(k); },
  };
}

test("login survives being loaded again", async () => {
  const redis = fakeRedis();
  const first = await useRedisAuthState(redis, "auth");
  first.state.creds.registered = true;
  await first.saveCreds();
  await first.state.keys.set({ "pre-key": { 1: { public: Buffer.from([1, 2, 3]), private: Buffer.from([4]) } } });

  const again = await useRedisAuthState(redis, "auth");
  assert.equal(again.state.creds.registered, true);
  assert.ok(Buffer.isBuffer(again.state.creds.noiseKey.private));
  const keys = await again.state.keys.get("pre-key", ["1", "2"]);
  assert.deepEqual([...keys["1"].public], [1, 2, 3]);
  assert.equal(keys["2"], null);
});

test("deleting a key and clearing the login", async () => {
  const redis = fakeRedis();
  const auth = await useRedisAuthState(redis, "auth");
  await auth.state.keys.set({ session: { a: { x: 1 } } });
  await auth.state.keys.set({ session: { a: null } });
  assert.equal((await auth.state.keys.get("session", ["a"])).a, null);

  auth.state.creds.registered = true;
  await auth.saveCreds();
  await auth.clear();
  assert.notEqual((await useRedisAuthState(redis, "auth")).state.creds.registered, true);
});
