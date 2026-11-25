import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The tests cover the module's own maths (src/tempo.ts, src/patch.ts, src/presets.ts, src/arp.ts,
// src/machine/layout.ts) and its synth voice (src/poly.worklet.ts), rendered here in node. The
// voice imports only the engine's voiceApi, which needs nothing from a browser.
export default defineConfig({
  resolve: { alias: { "@engine": fileURLToPath(new URL("./node_modules/alive-engine/src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
