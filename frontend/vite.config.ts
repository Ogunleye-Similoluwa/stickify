/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work both on GitHub Pages (/stickify/) and on Netlify (/).
  base: "./",
  // ffmpeg.wasm starts its own worker; pre-bundling breaks the worker's URL.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
