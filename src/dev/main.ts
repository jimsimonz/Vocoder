/**
 * The test page: the engine's small container (@engine/api/iwsdk/devContainer), so the module can
 * be worked on and checked without another app. It makes the world, the XR session, one
 * AudioContext with the mix bus on it, grab detection and the window manager, then installs the
 * module from source, with a bar of buttons that play the part of the rest of a real container.
 *
 * Nothing of the engine is imported here before startDevContainer(): it says who the page is
 * first, and brings the module in after (`load`). None of this ships in the module's bundle
 * (vite.module.config.ts builds that from src/vocoder-module.ts alone).
 *
 * In the console: __dev.install(), __dev.remove(), __dev.leakCheck(), __dev.otherClaim(100),
 * __dev.test() (the module's own test hooks). `npm run check:removal` runs the leak check in a
 * headless browser. A real container (Controllerist) also loads the module by address and can run
 * several instances of it: `npm run controllerist` before calling a module done.
 */
import { Component as UIKitComponent } from "@pmndrs/uikit";
import { startDevContainer } from "@engine/api/iwsdk/devContainer";

await startDevContainer({
  id: "vocoder",
  name: "Vocoder",
  uikit: UIKitComponent,
  load: () => import("../vocoder-module"),
});
