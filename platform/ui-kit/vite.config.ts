import { defineConfig } from "vite";

export default defineConfig({
  build: {
    cssCodeSplit: false,
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/"),
      output: {
        assetFileNames: (asset) => asset.name === "style.css" ? "style.css" : "[name][extname]",
      },
    },
  },
});
