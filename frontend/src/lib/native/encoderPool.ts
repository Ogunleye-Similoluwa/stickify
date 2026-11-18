/** A small pool of workers that encode frames to WebP in parallel, using every CPU core. */
type Pending = { resolve(data: Uint8Array): void; reject(err: Error): void };

let workers: Worker[] = [];
const pending = new Map<number, Pending>();
let nextId = 0;
let turn = 0;

function pool(): Worker[] {
  if (workers.length) return workers;
  const cores = navigator.hardwareConcurrency || 4;
  const count = Math.max(2, Math.min(8, cores - 1));
  workers = Array.from({ length: count }, () => {
    const worker = new Worker(new URL("./encodeWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; data?: ArrayBuffer; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.data) job.resolve(new Uint8Array(e.data.data));
      else job.reject(new Error(e.data.error ?? "Encoding failed"));
    };
    return worker;
  });
  return workers;
}

/** Encodes a copy of the bitmap (the original stays usable for another try). */
export function encodeFrame(bitmap: ImageBitmap, quality: number): Promise<Uint8Array> {
  const all = pool();
  const worker = all[turn++ % all.length];
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, bitmap, quality }); // cloned, not transferred
  });
}

export function encodeAll(bitmaps: ImageBitmap[], quality: number): Promise<Uint8Array[]> {
  return Promise.all(bitmaps.map((b) => encodeFrame(b, quality)));
}

/** Start the workers and run a tiny encode so the first real frame doesn't pay the start-up cost. */
export function warmPool(): void {
  const canvas = new OffscreenCanvas(8, 8);
  canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
  const bitmap = canvas.transferToImageBitmap();
  Promise.all(pool().map(() => encodeFrame(bitmap, 0.5))).catch(() => {}).finally(() => bitmap.close());
}
