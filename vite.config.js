import { defineConfig } from "vite";

// base "./" gør, at siden virker på GitHub Pages uanset repo-navn (fx brugernavn.github.io/chesshub/).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
  },
});
