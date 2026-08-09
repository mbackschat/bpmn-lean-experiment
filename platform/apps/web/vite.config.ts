import { defineConfig } from "vite";

const platformApiOrigin =
  process.env.PLATFORM_API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: platformApiOrigin,
      },
    },
  },
});
