/// <reference lib="webworker" />
// Encodes 512x512 frames to WebP with the browser's own (native) encoder.
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap; quality: number }>) => {
  const { id, bitmap, quality } = e.data;
  try {
    if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      ctx = canvas.getContext("2d");
    }
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    ctx!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.type !== "image/webp") throw new Error("WebP encoding is not supported here");
    const data = await blob.arrayBuffer();
    (self as unknown as Worker).postMessage({ id, data }, [data]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
