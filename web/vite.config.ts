import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // changeOrigin must stay false. Vite's string shorthand turns it on,
      // which rewrites Host to the backend's address — the server then sees
      // Host and Origin disagree and refuses every write as cross-origin.
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: false },
    },
  },
});
