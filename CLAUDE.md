# CLAUDE.md

A vocoder feature module for AliveEngine containers (Controllerist): a six-voice synth played from its keys (the carrier), shaped
live by the player's voice through the microphone (the modulator). Made from the Poly Sixty module, from SampleModule.
`README.md` holds the full guide for writing a module (the block under "Guide for your AI"): follow it for any change here.

- `npm run check` and `npm run build` must pass before a commit.
- `thumbnail.jpg` is the module's picture (its card in Controllerist's Instruments browser), passed to
  `moduleBuild` in `vite.module.config.ts`: 16:9, 480 x 270, the machine as it looks in the world, no text.
  Make a new one when its look changes (README guide, "Its picture").
- The module is `src/vocoder-*.ts`, `src/vocoder.worklet.ts`, `src/carrier.worklet.ts`, `src/patch.ts`, `src/presets.ts`,
  `src/arp.ts`, `src/lesson.ts`, `src/i18n/`, `src/machine/`; `src/dev/` is the test page (a small container) and never ships
  in the module's bundle.
- The engine is read-only here (`node_modules/alive-engine`, pinned in package-lock.json): its contract
  for modules is `node_modules/alive-engine/MODULES.md`.
- The sound: keys play the carrier (`src/carrier.worklet.ts`, the Poly Sixty's voice, on the engine's audio sequencer) and its
  track plays into the vocoder's own AudioWorkletNode (`destination`), which goes to the instance's channel. A voice file
  imports only `@engine/core/voiceApi` and allocates nothing in render().
- The vocoder is `src/vocoder-dsp.ts` (plain arithmetic, tested in node, allocates nothing once made) run by
  `src/vocoder.worklet.ts` (imported with `?worker&url`, one self-contained file that imports only `vocoder-dsp.ts`, loaded
  once per audio context). Its processor is registered under a name with a number (`controllerist-vocoder-1`): change the
  number when what it does changes, or a page with the old one loaded keeps it. Keep it near 1-2% of a desktop core (its test measures it).
- The microphone is the engine's `openMicrophone` and nothing else (MODULES.md, "The microphone"): opened only by MIC ON
  (never at install), closed on MIC ON again and in dispose(). Its blocks go to the node by port with their frame; the node
  reads them from a ring a little behind `currentFrame` (never by when they came).
- It looks like a vocoder keyboard of its own (a blue-grey panel, orange and teal headings, cream buttons with teal lights,
  orange memory buttons, wooden cheeks) under its own name and badging (VX-16): never a real product's name, logo, model
  number or panel artwork. Its 8 sounds (`src/presets.ts`) are our own.
- The panel is data: `SLIDERS`, `SWITCHES` and `BUTTONS` in `src/patch.ts` (what they send the carrier: `voiceParams`; the
  vocoder: `vocoderParams`), placed by `src/machine/layout.ts` (`PANEL`). The top right corner of the top face stays clear:
  the container's M and S buttons go there.
- Drawn at 0.8x (`SCALE` in `vocoder-machine-3d.ts`). Keys press along their own axis (the engine's pressAxis "local").
- Repeated parts come from the engine's shared instance pools through `src/machine/pooled.ts`. No onBeforeCompile on pool materials.
- Try it inside Controllerist with `npm run build:module && npm run controllerist` (localhost only; a headset
  via `adb reverse tcp:8090 tcp:8090`). Keep the engine current with `npm run engine:update`.
- Carry grabs use `snapPose: "hold"`; sliders and wheels snap by themselves (the engine's pose system).
- In a room: keys go through `playTogether`, switches are `room.state`, sliders and wheels have a `sync` id, as on our other
  synths; but the sound is `"host-stream"` (the voice that shapes it is the host's microphone, only on the host's page), a
  guest's copy is silent (its output gain 0) and MIC ON works only alone or for the host. The microphone is never room state.
- Notes from MIDI keyboards and other modules' sequencers come through `context.midi.onNote` (`early: true`).
- Import the engine only through `@engine/api/module` and `@engine/api/iwsdk/module` (the
  contract; `node_modules/alive-engine/MODULES.md`, "Versions"). The scripts are the engine's
  `alive-module` (`controllerist`, `publish-pages`, `check`).
- `src/dev/main.ts` is the engine's test page (`startDevContainer`). `npm run build && npm run
  check:removal` must say "Clean" before a commit that changes what the module makes.
- Words people read (the lesson's lines, title and sub) are translated (es, fr, de, ja) through `src/i18n/`
  (`addTranslations`, MODULES.md "Translations"); a new string needs all four. Faceplate text stays English.
- The lesson has no voice clips yet (`public/lessons/`: the engine's `scripts/lesson-voice.mjs` makes them, with a key).
