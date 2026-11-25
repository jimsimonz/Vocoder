// Builds the module itself: dist/module/vocoder.js (all of its code, in one file) and
// dist/module/vocoder.json (the manifest a container's list points at). three.js, the XR SDK,
// UIKit and the engine are the container's: the bundle imports them from the container's
// /shared/ addresses instead of carrying copies. Run after the test page's build (`npm run
// build` does both): it adds to dist/.
import { defineConfig } from "vite";
import { aliveEngine, moduleBuild } from "alive-engine/vite-plugin";

export default defineConfig({
  plugins: [
    aliveEngine({ publicFiles: false }),
    // thumbnail: its picture on its card in the container's browser (Controllerist: Instruments).
    moduleBuild({ id: "vocoder", name: "Vocoder", entry: "src/vocoder-module.ts", outDir: "dist/module", thumbnail: "thumbnail.jpg", again: "another" }),
  ],
  publicDir: false,
});
