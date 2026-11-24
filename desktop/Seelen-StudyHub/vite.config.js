import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "index.js",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: "index.css",
      },
    },
  },
});
