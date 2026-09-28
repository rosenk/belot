import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  experimental: { bundledDev: true },
  server: { allowedHosts: [".onamp.dev"] },
});
