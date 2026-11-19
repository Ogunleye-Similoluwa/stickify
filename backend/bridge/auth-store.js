// Keeps the WhatsApp login in Redis (Render Key Value), so it survives the server restarting,
// sleeping or redeploying. Without a Redis URL it falls back to files, which are lost on restart.
import { rm } from "node:fs/promises";
import { BufferJSON, initAuthCreds, proto, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { createClient } from "redis";

/** Same contract as Baileys' useMultiFileAuthState, stored in one Redis hash. */
export async function useRedisAuthState(redis, hash) {
  const read = async (field) => {
    const raw = await redis.hGet(hash, field);
    return raw ? JSON.parse(raw, BufferJSON.reviver) : null;
  };
  const write = (field, value) => redis.hSet(hash, field, JSON.stringify(value, BufferJSON.replacer));

  const creds = (await read("creds")) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await read(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const field = `${category}-${id}`;
              tasks.push(value ? write(field, value) : redis.hDel(hash, field));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write("creds", creds),
    clear: () => redis.del(hash),
  };
}

/** Opens the login store: Redis when a URL is given, otherwise a folder. */
export async function openAuthStore({ redisUrl, folder, log }) {
  if (redisUrl) {
    const redis = createClient({ url: redisUrl, socket: { reconnectStrategy: (n) => Math.min(n * 500, 5000) } });
    redis.on("error", (e) => log.warn({ err: e.message }, "Key Value connection problem"));
    await redis.connect();
    log.info("Keeping the WhatsApp login in Key Value, so it survives restarts");
    return { load: () => useRedisAuthState(redis, "stickify:wa-auth") };
  }
  log.warn("No WA_REDIS_URL set: the WhatsApp login is lost whenever the server restarts");
  return {
    load: async () => {
      const auth = await useMultiFileAuthState(folder);
      return { ...auth, clear: () => rm(folder, { recursive: true, force: true }) };
    },
  };
}
