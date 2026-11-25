// The test page (index.html + src/dev/): a small container of our own, so the module can be
// worked on without another app. The module's own build is vite.module.config.ts.
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { iwsdkDev } from "@iwsdk/vite-plugin-dev";
import { aliveEngine } from "alive-engine/vite-plugin";

// The XR emulator (IWER) is for desktops in development. Deployed builds, and `NO_XR_EMULATOR=1
// npm run dev`, leave it out: the page is then a plain 3D page you click with the mouse.
const emulate = !process.env.VERCEL && !process.env.CI && !process.env.NO_XR_EMULATOR;

export default defineConfig({
  plugins: [
    aliveEngine({ publicFiles: false }), // (its avatars and popups stay out of the build: the test page uses none)
    mkcert(),
    ...(emulate ? [iwsdkDev({
      emulator: { device: "metaQuest3", activation: "always", environment: "living_room" },
      ai: { mode: (process.env.IWER_AI_MODE as "agent" | "collaborate" | undefined) ?? "collaborate" },
      verbose: true,
    })] : []),
  ],
  server: { host: "0.0.0.0", port: Number(process.env.DEV_PORT) || 8089, open: false },
  build: { outDir: "dist", target: "esnext" },
  esbuild: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  publicDir: "public",
  base: "./",
});
