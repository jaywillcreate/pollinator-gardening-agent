import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production build is served from Express at /admin/ on the agent server, so
// asset URLs need that prefix. Dev keeps "/" so http://localhost:5173/ works
// unchanged. Override via VITE_BASE for other deploy targets (GitHub Pages,
// user/org sites, custom domains).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE || (command === "build" ? "/admin/" : "/"),
}));
