# Vocoder

A 3D vocoder **feature module** for apps built on
[AliveEngine](https://github.com/jimsimonz/AliveEngine) (Controllerist is one): a six-voice synth
played from its keyboard (the carrier), shaped live by your voice through the microphone (the
modulator) in sixteen bands. Eight sounds in memory, HOLD, and an arpeggiator on the music clock.
Made from the [Poly Sixty](https://github.com/jimsimonz/PolySixty) module (its keyboard, panel and
voice), from [SampleModule](https://github.com/jimsimonz/SampleModule) and its guide (below).

Its own name and badging (VX-16) and its own sounds: no maker's name, logo, panel artwork or
factory patches.

## Try it

```bash
npm install --legacy-peer-deps   # the engine is a private git dependency: you need access to its repo
npm run dev                      # https://localhost:8089: the module on a small test page
npm run check                    # types + tests (the carrier and the vocoder are run in node)
npm run build                    # dist/ (the test page) and dist/module/ (the module, and its two audio-thread files)
npm run publish:pages            # build, and push the module to this repo's gh-pages branch
npm run build:module && npm run controllerist   # https://localhost:8090: the real Controllerist, with this module in development
```

`npm run controllerist` runs the real Controllerist on this computer with this module in development (a DEV
button; or `__worlds.modules.summon("vocoder")` in the console). It works only on `localhost`: for a
headset, `adb reverse tcp:8090 tcp:8090` (over USB or wireless adb) and the same address in its
browser.

## What it does

| | |
|---|---|
| Keyboard | Five octaves and a C (C2 to C7). A key sounds while it is held down; six notes at once. With the microphone off there is nothing to hear (the vocoder needs a voice), unless MIX SYNTH is up. |
| MIC | MIC ON opens the microphone (the browser asks the first time) and lights while it is open; press again to close it. GAIN: 0 to +30 dB before the vocoder. Echo cancelling is on, so what the speakers play isn't taken for your voice. |
| CARRIER | The synth your voice shapes: SAW and PULSE (either or both), RANGE 16', 8', 4', PWM, SUB, NOISE (helps consonants), BRIGHT. |
| ENV | A and R of every note (it holds while the key is down). |
| VOCODER | 16 bands from 100 Hz to 8 kHz. FORMANT moves the carrier's bands an octave either way against the voice's (down: bigger and deeper; up: smaller and higher). RESP: how fast the bands follow the voice (crisp to smooth). Q: the bands' sharpness. SIBIL: the voice's own s, t and f sounds (above 6 kHz), let through while keys sound. |
| MIX | VOC (the vocoded sound), SYNTH (the carrier as it is), VOICE (the microphone as it is). |
| CHORUS | OFF, I, II, and I with II together, on the carrier. |
| Memory | Eight sounds of our own, 1 to 8: each sets the carrier, ENV and VOCODER, and their buttons. |
| Arpeggio, HOLD, Master, Bender | As on the Poly Sixty: ON plays the held keys one after another on the music clock; HOLD keeps them; VOLUME and OCT; BEND and MOD. |
| From elsewhere | A MIDI keyboard or another module's step sequencer plays its keys. |
| In a room | Keys, buttons and sliders are shared as on our other synths, but the sound is the host's: the voice that shapes it is the host's microphone. The room hears the host's stream; a guest's copy is silent, and MIC ON is the host's. |
| OFF | Asks the container to remove it (your copy only). |

## How it works

```
keys -> the carrier (src/carrier.worklet.ts, on the engine's sequencer track) --.
                                                                                 +-> the vocoder (src/vocoder.worklet.ts) -> its channel
microphone (the engine's openMicrophone) ------ blocks with their frame, by port -'
```

- The carrier is the Poly Sixty's voice on the engine's audio sequencer; its track plays into the
  vocoder's node (`destination`) instead of the channel.
- The microphone is the engine's `openMicrophone` (MODULES.md, "The microphone"): its blocks come a
  little behind live, stamped with their frame on the container's context. The node writes them into
  a ring where their frames say and reads a little behind `currentFrame`, just far enough that every
  block has come; late blocks push that out at once, and it comes back in slowly.
- The vocoder (`src/vocoder-dsp.ts`, plain arithmetic, tested in node): the voice through 16
  band-passes (4-pole), an envelope each; the carrier through 16 band-passes (2-pole, at the same
  centres moved by FORMANT), each times its envelope, summed; a soft limit on the output. About 1.3%
  of one desktop core for 16 bands in stereo.

## Files

| File | What it is |
|---|---|
| `src/vocoder-module.ts` | The module: default export `{ id, install }`. The build's entry. |
| `src/vocoder-machine.ts` | Keys, HOLD, the arpeggiator, the memory, the panel's values, the microphone, the carrier's track and the vocoder's node. No UI. |
| `src/vocoder-dsp.ts` (+ test) | The vocoder's arithmetic. |
| `src/vocoder.worklet.ts` | Its processor on the audio thread: the carrier in, the microphone's ring, the vocoder. |
| `src/carrier.worklet.ts` (+ test) | The carrier: six notes and the chorus, on the audio thread in the engine's sequencer. |
| `src/patch.ts`, `src/presets.ts`, `src/arp.ts` (+ test) | The panel (every slider, switch and button, and what it sends the carrier and the vocoder), the eight sounds, the arpeggio's notes. |
| `src/lesson.ts`, `src/i18n/` | Its lesson (MIC ON, a key held while talking, FORMANT) and its words in es, fr, de, ja. |
| `src/vocoder-machine-3d.ts` | The 3D machine: builds it, hooks its keys, buttons, sliders, wheels and casing into the container's grab detection, and moves what changed. |
| `src/machine/layout.ts` (+ test) | Where every key, slider, button, light and wheel sits, in metres. |
| `src/machine/faceplate.ts`, `src/machine/wear.ts` | The printed panel, the wood, and the wear. |
| `src/machine/pooled.ts` | Repeated parts from the engine's shared instance pools. |
| `thumbnail.jpg` | Its picture: its card in Controllerist's Instruments browser (480 x 270, the machine as it looks in the world). |

## Guide for your AI (copy this)

The guide below is SampleModule's, unchanged. In this repo the metronome's files are
`src/poly-module.ts`, `src/poly-machine.ts`, `src/poly-machine-3d.ts` (a 3D object instead of a panel) and
the voice `src/poly.worklet.ts` (as `src/bell.worklet.ts`).

Use the copy button at the top right of this block.

````markdown
# Task: build a feature module for an AliveEngine container

You are working in a copy of the SampleModule repo. It holds a complete, working module (a
metronome). Build the module I describe by changing it: keep the layout, the build and the
contract, and replace the metronome's own code. Read `src/metronome-module.ts`,
`src/metronome.ts` and `src/metronome-panel.ts` first: they are the pattern, and their comments
say why each line is there. The engine's source is in `node_modules/alive-engine/src/` and its
contract for modules is `node_modules/alive-engine/MODULES.md`: read them when you need more
than this guide gives. Never edit anything under `node_modules/`.

## What a module is

A container app (Controllerist) owns the page: one 3D world, one XR session, one audio context,
one multiplayer room. A feature module is one feature (DJ decks, a minigame, this metronome)
built in its own repo and published as a single JavaScript file plus a manifest. The container
fetches it while running and installs it into its world; removing it takes out everything it
made. Several instances of one module can run side by side.

## What to build against

- `@iwsdk/core` 1.1.0 (Meta's Immersive Web SDK: the ECS world, XR session, UI panels).
- three.js as `super-three` 0.185.0 (`"three": "npm:super-three@0.185.0"`).
- `@pmndrs/uikit` 1.0.76 (panels), markup in UIKitML.
- `alive-engine` (git dependency). Import the engine through its two public entries,
  `@engine/api/module` and `@engine/api/iwsdk/module` (popups and the 3D M and S): what they
  export is the contract and keeps its names. Other engine files can be imported by path, but
  nothing promises they stay as they are. The networking, avatar and analytics libraries are
  the container's: this repo doesn't install them.
- TypeScript, Vite 7, Node 20.19 or later. Install with `npm install --legacy-peer-deps`.

Keep the versions in `package.json` as they are: the module runs against the container's copies
of these libraries, not its own.

## Files

| File | What it is |
|---|---|
| `src/metronome-module.ts` | The module: default export `{ id, install }`. The build's entry. |
| `src/metronome.ts` | The feature's logic: audio and the music clock. No UI. |
| `src/metronome-panel.ts` | An ECS system with one popup panel. |
| `public/ui/metronome.uikitml` | The panel's markup. |
| `src/tempo.ts`, `src/tempo.test.ts` | Pure maths, with tests. Put logic that can be tested here. |
| `vite.module.config.ts` | Builds the module: `dist/module/<id>.js` and `<id>.json`. |
| `src/dev/main.ts`, `index.html`, `vite.config.ts` | The test page: the engine's small container (`startDevContainer`). Not part of the module. |

To make a new module: choose a short, stable id (lower case, no spaces: storage, rooms and
instance names use it), rename the files, and change the id in `src/<id>-module.ts`,
`vite.module.config.ts` (`id`, `name`, `entry`) and `src/dev/main.ts` (`id`, `name`, `load`).

## The contract

```ts
import type { World } from "@iwsdk/core";
import type { FeatureModule, InstalledModule, ModuleContext } from "@engine/api/module";

export default {
  id: "metronome",
  async install(world: World, context: ModuleContext): Promise<InstalledModule> {
    // Build into the world you are given: world.registerSystem(...), world.scene.add(...).
    return {
      placed,                     // optional Promise<void>: settles when its things stand where it
                                  // means them to (the container moves it only after this)
      ready,                      // optional Promise<void>: settles when it is ready to be seen
      place(anchor) {},           // optional: bring your things to someone standing at `anchor`
      placement() {},             // where your things are (Matrix4, world space) or null
      setPlacement(matrix) {},    // put them there: with these two, the container keeps every
                                  // player's copy where the host has it, and across a reload
      moveBy(matrix) {},          // optional: move by a world-space transform (a change of world)
      dispose() {},               // required: your own part of being removed (see "Removal")
    };
  },
} satisfies FeatureModule<World>;
```

What `context` gives you:

- `instance`: which instance this is: `"metronome"` for the first, `"metronome#2"` for the next.
  Show it to people; use it as your name on the music clock.
- `slug` (`"metronome"`, `"metronome-2"`: for ids, such as a popup's) and `number` (1, 2: for
  showing; `instanceLabel(context.instance, "Metronome")` gives "Metronome 2").
- `storage`: this instance's saved data: `storage.get("bpm", 120)`, `storage.set("bpm", 128)`
  (JSON, never throws; kept as `"metronome-bpm"`, `"metronome-2-bpm"` for the second instance,
  the same in any container). `storageKey(name)` gives the key itself, for data kept another way.
- `assetPath(file)`: the address of one of your own public files, wherever the module is served
  from: `assetPath("ui/metronome.uikitml")`.
- `anchor`: an `Object3D` at the eyes of the person who asked for the module, facing its -Z, or
  null. Put your things in front of it.
- `audio`: the container's audio (see "Sound"). Null only when the container has none.
- `scope`: everything you make is recorded here (see "Removal").
- `requestRemoval()`: call it from your own Remove button. The container decides.

## What is the container's, never the module's

A module never does any of these: the container already has, and there must be one on the page.

- Create the `World`, start or end the XR session, or call `configureEngine()`.
- Create an `AudioContext` when `context.audio` is given.
- Bundle its own three.js, IWSDK, UIKit or engine: the build leaves them as imports that the
  container satisfies with its own copies. Import them normally; never copy their code in.
- Bring its own networking, voice, avatars, popups, input or grab detection. Use the engine's:
  `context.room` and `sync` controls for multiplayer (see "In a room"), `Popup` from
  `@engine/api/iwsdk/module` (popups), `getGrabDetection()` from `@engine/api/module` (hands on
  controls). The build warns if the bundle carries one of the engine's own libraries.
- Call `setNetHost`, `setPanelHost` or any other `set...Host`: those are the container's. A
  module that must add to a host uses the `add...Host` form and undoes it in `dispose()`.
- Assume it is alone: other modules, and other instances of this one, share the world.

## In a room (multiplayer)

Everyone in a room runs their own copy of your module. The engine makes those copies one shared
thing; you never send messages yourself. (Full contract: `node_modules/alive-engine/MODULES.md`,
"Its controls in a room" and "Everything else it shares".)

**The room's mode is the host's choice** (the Live Session popup's "Guests play" button):
performance (the default: only the host plays, guests see everything) or collaboration (anyone
plays). Everything below follows it; you don't check it yourself, except to grey out what this
player can't press (`context.room.canPlay()`).

- **Where it stands.** Give it `placement()` and `setPlacement()` (the sample's panel does): each
  guest's copy starts where the host's stands and follows every move. In collaboration a guest
  can carry it too (one person at a time). You send nothing.
- **Controls.** Give a knob, fader or button you register with grab detection a `sync` id, and
  it is one control for the room: it turns, slides and goes down on every copy, and your
  callbacks run on every copy as if that player had done it. `hostOnly: true` keeps one the
  host's (a master volume).

  ```ts
  grab.registerControl(index, { ...knob, sync: { id: "cutoff" } });   // stable within your module
  grab.registerButton(index, { ...stepKey, sync: { id: "step-3" } });
  ```
- **State that isn't a control** (a tempo, patterns, the selected sound, a score): shared state.
  The host's value is the room's; everyone's changes go through the host, so every copy ends the
  same, and anyone who joins later gets it. Small JSON only (64 KB).

  ```ts
  const shared = context.room.state("metronome", { bpm: 120, running: false });
  shared.subscribe((s) => apply(s));           // every change, made here or by anyone
  shared.update((s) => ({ ...s, bpm: 130 }));  // false when this player may not change it now
  ```

  Do everything through it: a button press changes the shared state, and the subscription is what
  actually starts, stops or retunes your copy. Outside a room it is plain local state, so there
  is one code path. (This is what the sample does: `src/metronome.ts`.)
- **Live notes and pad hits**: `playTogether(context.room, track)` (from `@engine/api/module`),
  then `live.hit("SD")`, `live.noteOn(60)`, `live.noteOff(60)`: each plays on the same step on
  every copy. For anything else that must happen on one beat everywhere:
  `context.room.sendAtBeat(event, beat)` and `context.room.onBeatEvent(...)`.
- **One holder at a time** (playing a part, a solo): `context.room.claim("solo")`, then
  `await claim.take()`, `claim.release()`, `claim.holder()`.
- **The clock is the room's.** Whoever holds MASTER anywhere in the room is every page's master,
  in each page's own time: your clock code works unchanged. Claim the master by starting only on
  the host's copy (`context.room.role() !== "audience"`), as the sample does; guests follow it.
- **Sound.** `context.room.setSound("local-render")` when every copy can play itself from the
  shared state, synced controls and beat events (a sequencer and a synth voice: the same events
  give the same sound). Each copy then plays its own, and the host's stream leaves yours out, so
  nobody hears it twice. Without it the host's sound is streamed to guests, and only the host is
  heard playing.

What each player saves for themselves (their own preferences) still goes through
`context.storageKey()`; the room's shared state lasts for the session.

## Instances and top-level variables

Each install loads a fresh copy of the module's file, so every instance has its own top-level
variables, its own ECS component names, its own registry entries, its own saved data and its
own room messages, without the module doing anything. Two rules follow:

- Top-level state (`let model = ...` at the top of a file) is fine and is per instance.
- The browser never unloads a script, so a removed copy's top-level variables last as long as
  the page. In `dispose()`, set to null any that hold something big (decoded audio, textures,
  caches) or that reach your objects.

Ids you hand to shared engine services must differ per instance: derive them from
`context.instance` (the sample's popup id is `"metronome"`, `"metronome-2"`).

## Removal

Recorded in your scope and released for you: timers, animation frames, event listeners,
workers, audio nodes, sockets, observers, object URLs, page elements, ECS systems (their
`destroy()` runs), entities, 3D objects you add to the world and their GPU memory, UIKit
panels, and engine registrations (the music clock membership among them).

Yours to do in `dispose()`:

- Stop what should stop audibly first; save what should be saved.
- Free GPU memory you hold outside the scene (render targets, material caches).
- Null big top-level variables; delete `window.__...` globals you set.
- Undo any change to something you did not make.

For anything the scope cannot see, register it: `context.scope.onDispose(fn)`, or pass
`context.scope.signal` (an AbortSignal) to `addEventListener` and `fetch`.

## Sound: one audio context, one mix bus

Everything on the page plays through the container's one `AudioContext`, into a mix bus. Each
module instance has a channel of its own on it.

```ts
const ctx = await context.audio.ensure();        // makes or resumes it; first call needs a user gesture
myNode.connect(context.audio.output(ctx));       // your channel on the mix bus (the speakers if there is no bus)
```

A channel has three inputs: `input` (heard here and by everyone in the room), `speakers` (heard
on this device only: monitoring, a cue) and `programme` (heard by the room only). Use `input`
unless you have a reason. The container applies the listener's volume, dips the bus under
voices, and removes your channel when the instance is removed. Call `ensure()` from a button
press, not at install: browsers only start audio on a user gesture.

## Time: the music clock

The page has one tempo and one beat, shared by everything that keeps time, with one master.
The API is in `@engine/api/module`.

A clock is `ClockBeat { originTime, bpm }`: beat `n` falls at `originTime + n * 60 / bpm`
seconds, in the shared AudioContext's `currentTime`. All modules share that context, so a time
means the same moment to all of them.

```ts
import { joinMusicClock, musicClockMaster, beatAt, nextBeatTime, onMusicClock } from "@engine/api/module";

const membership = joinMusicClock({
  id: context.instance,
  follow(beat, master) {
    // The master changed or its clock moved.
    // beat != null: `master` (a name, e.g. "decks:A") leads; lock your tempo and phase to `beat`.
    // beat == null: there is no master, or the master is you; keep your own time.
  },
});
```

- **Lead.** `membership.claimMaster(name, beat)` makes you the master with your clock as it is
  now. The last claim wins, so claiming is all a MASTER button does. Then call
  `membership.publish(beat)` every time your clock moves (a tempo change, a nudge).
  `membership.releaseMaster()` when you stop. `membership.holdsMaster()` says whether you lead.
- **Follow.** `follow()` is called at once on joining if there is a master, and again whenever
  it changes. When another source claims the master, your `follow()` gets its clock: that is
  when your MASTER light goes off.
- **Convention.** If nothing is the master (`musicClockMaster() === null`) when you start
  playing, claim it. The decks do the same.
- **Change tempo without a jump.** Keep the beat reached so far and change the spacing after it:
  `retempo(clock, newBpm, now)` from `@engine/api/module`
  (`originTime = now - beatAt(clock, now) * 60 / newBpm`).
- **Take over without a jump.** To become master while following, claim with the clock you are
  following.
- **Watch only.** `onMusicClock(({ master, beat }) => ...)` for something that reacts to the
  tempo but never leads.

## Rhythm: the audio sequencer

Anything rhythmic (a drum machine, a metronome, an arpeggio, a loop of one-shots) plays through
`createSequencerTrack` (`@engine/api/module`). It decides every hit on the audio thread, on the exact sample, from
the music clock: a stall on the page's main thread (a world loading, garbage collection, a heavy
frame on a headset) can't make a hit late or lose one, and a tempo change applies from the very
next step. One worklet plays every module's tracks.

```ts
import { createSequencerTrack } from "@engine/api/module";

const track = await createSequencerTrack({
  id: context.instance,
  context: ctx,                                  // the container's AudioContext
  destination: context.audio.output(ctx), // your mix bus channel
});
await track.loadSounds({ BD: bdBuffer, SD: sdBuffer, CH: chBuffer, OH: ohBuffer }); // AudioBuffers or Float32Arrays
track.setPattern({
  stepsPerBeat: 4, length: 16,                   // a bar of sixteenths
  lanes: { BD: 0b0001000100010001, SD: 0b0001000000010000, CH: 0xffff }, // bit i = step i
  accent: { lane: 0b0001000100010001, boost: 1.7 },
});
track.setChokeGroups([["CH", "OH"]]);            // a closed hat cuts the open one
track.setShuffle(0.2);                           // off-beat sixteenths a fifth of a step late
track.setClock(myClock);                         // the clock to keep when there is no master
track.play();                                    // from the next step
track.queuePattern(nextPattern);                 // takes over at the next bar
track.schedule([{ sound: "SD", beat: 129 }]);    // free timing: exact beats of the clock
track.trigger("SD");                             // now (a pad)
track.onStep((step, time) => { /* lights only, never timing */ });
```

- It follows the page's master by itself, and step 0 of a pattern is on the master's downbeat.
  With no master it keeps the clock you gave `setClock()`; with neither, it waits.
- Lanes are bit masks (up to 32 steps) or arrays of levels (0 to 1) or booleans, one per step.
- `stop()` lets ringing sounds finish; `stop({ cut: true })` fades them out at once.
- The track is recorded in your module's scope and disposed when the module is removed (its
  sounds on the audio thread too). `track.dispose()` sooner if you like.
- (The sample's metronome plays its clicks as notes on a voice of its own: "Your own synth voice".)

Notes (a bass line, a lead) play on the track's built-in synth voice, decided on the audio thread
like the drum lanes:

```ts
track.setParams({ cutoff: 0.4, resonance: 0.7, envMod: 0.6, decay: 0.3, accent: 0.7, wave: "saw", glide: 0.06, drive: 0.3, volume: 0.8 });
track.setNotes({
  stepsPerBeat: 4,
  steps: [
    { note: 36, gate: 0.55, accent: true },   // MIDI note; gate: the fraction of its step it sounds
    { note: 36, slide: true },                // held into the next note, gliding to it (no retrigger)
    { note: 48 },
    null,                                     // a rest
  ],
});
track.queueNotes(nextLine);                   // from the next bar
track.noteOn(60, { accent: true });           // a key pressed (last note wins); { slide: true } glides
track.noteOff(60);
```

- The voice is monophonic: saw or square, a 4-stage resonant low-pass, a filter envelope (`decay`)
  and an amp envelope, glide for slides, accents that kick the filter harder (close accents build
  up), and drive. All parameters are 0..1 except `decay` and `glide` (seconds), `tune` (semitones)
  and `wave`. Turn knobs with `setParams` at any time: smoothed, heard within a few milliseconds.

## Your own synth voice

The built-in voice is a 303-style mono bass. For anything else (a polysynth, a lead, FM, a
Minimoog-style voice) write your own: a class that runs on the audio thread, inside the engine's
sequencer, which calls it on each note's exact sample. Everything a note track does (sequenced,
queued and live notes, slides, accents, per-step and per-beat parameters, latency compensation, a
guest's room offset) reaches it through a few calls. `src/bell.worklet.ts` is a working example
(the metronome plays its clicks with it): copy it.

```ts
// my-voice.worklet.ts: runs on the audio thread. Import only @engine/core/voiceApi.
import { registerVoice, type NoteOnOptions, type Voice, type VoiceContext } from "@engine/core/voiceApi";

class MyVoice implements Voice {
  constructor(ctx: VoiceContext) { /* ctx.sampleRate; make every array here */ }
  noteOn(note: number, velocity: number, o: NoteOnOptions) { /* starts on sample o.at; o.slide: glide, no retrigger */ }
  noteOff(note: number, at: number) {}
  setParam(name: string, value: number | string) { /* smooth it yourself */ }
  render(out: Float32Array[], from: number, to: number): boolean { /* ADD into out[0], out[1]; false: silent */ return false; }
  allNotesOff?(at: number) {}
  dispose?() {}
}
registerVoice("my-module-voice", MyVoice); // your module's id in the name
```

```ts
// On the main thread:
import { createSequencerTrack, loadVoice } from "@engine/api/module";
import voiceUrl from "./my-voice.worklet.ts?worker&url";       // built as a file of its own

await loadVoice(ctx, voiceUrl);                                  // once per context (again: nothing)
const track = await createSequencerTrack({ id: context.instance, context: ctx, destination: channel.input, voice: "my-module-voice" });
track.setParams({ cutoff: 0.4, osc2Detune: 0.03 });              // your names: setParam(name, value)
track.setNotes({ steps: [{ note: 48, params: { cutoff: 0.2 } }, { note: 55, velocity: 0.6 }] });
track.scheduleParams([{ beat: 64, name: "cutoff", value: 0.9 }]); // automation on an exact beat
track.noteOn(60, { velocity: 0.8 }); track.noteOff(60);           // live keys
track.onVoiceError((e) => console.warn(e.reason, e.message));
track.voiceLoad();                                                // its share of the audio thread, measured
```

- **The build.** Name the file `*.worklet.ts` and import it with `?worker&url`. The module build
  bundles `voiceApi` into it, writes it under `dist/module/assets/`, lists it in the manifest, and
  stops if it imports another file or uses something the audio thread doesn't have (the DOM,
  timers, `fetch`, storage).
- **Timing.** `render` is called in pieces between events: everything up to a note's sample has
  been rendered when `noteOn` comes. Start on that sample, with no delay of your own.
- **Polyphony is yours.** `noteOn` can come with several notes held. The sequencer lets a voice hold
  16 at once and lets the oldest go first beyond that.
- **The budget.** The audio thread is everyone's. A voice that throws, outputs NaN or runaway
  levels, or uses more than 30% of each block's time (over a second, twice running) is muted and
  your `onVoiceError` hears why; the other tracks play on. On a Quest aim well under 10%: watch
  `voiceLoad()` on the headset. Nothing allocated in `render`.
- **Removal.** Removing your module disposes its voice instances (`dispose`). The code you added to
  the audio thread stays (it can't be unloaded); loading the same file again does nothing.

## Latency: visuals, live playing, a track's own delay

What the audio thread schedules is heard later, by the output latency (different on every device),
and for a guest in a room later again, by how late the host's stream reaches them. From
`@engine/api/module`:

- **Visuals** (step lights, playheads, beat lights): read `heardBeatAt(clock, ctx)`, never
  `beatAt(clock, ctx.currentTime)`, or they run ahead of the sound.
- **Live playing** (a key or pad pressed in time): `stepPlayedAt(clock, ctx, stepsPerBeat)` gives
  the step the player meant (what they heard when they pressed, less `inputDelay()`), counted from
  the downbeat as the sequencer counts: take it modulo your pattern's length.
- **A track's own delay** (oversampling, a lookahead limiter): `track.setLatency(seconds)`; the
  sequencer starts its events that much earlier.
- **In a room**: the sequencer plays a guest's tracks late by `musicClock.roomOffset()` by itself,
  so they line up with the host's music as that guest hears it. Sound you play any other way:
  delay it by `roomOffset()?.seconds` yourself.

Scheduling rules:

- Never time sound with `setTimeout`, `setInterval` or frames. For rhythm, use the sequencer
  above. For an occasional one-off sound, a timer may look a short way ahead (about 0.1 s) and
  hand the event to the audio thread with its exact time (`source.start(t)`,
  `param.setValueAtTime(v, t)`). `nextBeatTime(clock, t, every)` gives the next beat at or after
  `t` (`every = 4`: the next bar).
- For visuals, read `beatAt(clock, ctx.currentTime)` in your system's `update()` and redraw
  only when the value you show changes.
- Leaving the clock (and giving the master up) happens by itself on removal.

## Panels

UI in the world is a UIKitML file under `public/ui/`, shown by a `Popup` from the engine's
window manager, driven by an ECS system. `src/metronome-panel.ts` is the pattern:

```ts
// A system made for one instance: it holds that instance's context (the SDK constructs systems
// itself, so they can't be handed arguments), and nothing lives in a top-level variable.
export function myPanel(context: ModuleContext) {
  const PANEL_CONFIG = context.assetPath("ui/metronome.uikitml");
  return class MyPanelSystem extends createSystem({
    panel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, "config", PANEL_CONFIG)] },
  }) {
    private popup = new Popup({ id: context.slug, config: PANEL_CONFIG, width: 0.36, height: 0.29 }); // metres
    init() {
      this.queries.panel.subscribe("qualify", (entity) => { /* PanelDocument.data.document[entity.index] is ready: wire buttons */ });
      this.popup.open();          // or openAt(position, eye)
    }
    destroy() { /* stop your own subscriptions; the panel goes with your scope */ }
  };
}
// in install(): const Panel = myPanel(context); world.registerSystem(Panel); world.getSystem(Panel)
```

- The markup's address is `context.assetPath(...)`, never a literal `/ui/...`: inside a container
  `/ui/` is the container's.
- Colours set from code are the container's theme roles: `themeColor("accent")`,
  `themeColor("surface-raised")` (`@engine/api/module`), so the panel belongs in whichever app
  loads it. M and S: `bindPanelMix(context, { mute: el("mt-mute"), solo: el("mt-solo") })` draws
  and presses them as the mixer's.
- Never place a panel, make it grabbable or build grab zones by hand: `Popup` does all of it.
- Elements: `doc.getElementById(id)`, then `addEventListener("click", fn)` and
  `setProperties({ text, backgroundColor, color, opacity, display })`.
- UIKitML is not HTML. Layout is flexbox only. Style with classes in one `<style>` block. No
  `/* */` comments inside `<style>` (the build fails); use `<!-- -->` outside it. Size in
  pixels; the sample maps 720 px to 0.36 m (0.5 mm a pixel), which gives readable text.
- Every open panel costs frame time on a headset. One small panel is the norm.

## Hands on 3D controls

Register knobs, faders and carry grabs with the container's grab detection and the drawn hand
snaps to them; never pose the hand yourself. The container runs one pose system for the whole
page (`@engine/interaction/iwsdk/grabPose`), for every module.

- A `type: "knob"` control: palm down onto it, gripping it on its spin axis. The axis is +Z of the
  knob's frame (`visualGroup.parent`, or `mesh`, or `entity.object3D`): the same frame the twist
  detection uses. The fingers stay clear of a panel at that frame's z = 0; set `snapPanelZ` if
  your panel is elsewhere.
- `"slider"` and `"crossfader"`: the pinch rides the cap.
- Carrying an object by a `"panel-edge"` grab (an instrument by its casing or handle): add
  `snapPose: "hold"` and the hand stays fixed to it where it took hold. Without it, panels and
  popups behave as before.
- `snapPose: "none"` turns snapping off for a control.
- The grab's metadata is the only thing you set; never touch the hand model.

## Performance on a headset

The target is a Quest at 72 frames a second, so a frame has about 13 ms for everything on the
page. Do nothing in `update()` that allocates or redraws unless something changed. For 3D
content use instancing and shared materials, and keep to a handful of draw calls. Heavy work
(decoding, analysis) goes in a worker. Dependencies must be permissively licensed (MIT, BSD,
Apache, CC0).

## Build, run, check

- `npm run dev`: the test page at https://localhost:8089. It is the engine's small container
  (`startDevContainer` in `src/dev/main.ts`) with the module installed from source. Its buttons
  play the rest of a container: another clock source that takes the master, remove / install
  again, and the leak check. In the console: `__dev.install()`, `__dev.remove()`,
  `__dev.leakCheck()`, `__dev.test()` (your module's own test hooks).
  `NO_XR_EMULATOR=1 npm run dev` gives a plain page you click with the mouse.
- `npm run check`: TypeScript and tests. Must pass.
- `npm run build`: writes `dist/module/<id>.js` (the whole module in one file),
  `dist/module/<id>.json` (its manifest: id, name, entry, thumbnail, and what it takes from the
  container) and `dist/module/<id>-thumbnail.jpg`.
  The build must print no warning that the module bundles one of the engine's libraries.
- Removal check: `npm run build && npm run check:removal` installs and removes the module three
  times in a headless browser and fails if each time leaves more behind (it needs Playwright:
  `npm i -D playwright && npx playwright install chromium`, or `CHROME_PATH=` a Chromium you
  have). By hand: the test page's "Leak check" button; nothing may be left sounding, showing or
  logging errors.

## Its picture (thumbnail)

Every module has a picture: its card in Controllerist's Instruments browser shows it, with the name
under it. Replace `thumbnail.jpg` (the metronome's) with your module's:

- 16:9, 480 x 270, a `.jpg` (or `.png` / `.webp`), under about 100 KB.
- The module itself, as people see it in the world, filling the frame. No text: the card shows
  the name.
- To make one: open it inside Controllerist on your computer (`npm run controllerist`, below), bring it in
  from Instruments, stand where it looks best and screenshot the view, cropped to 16:9.
- `vite.module.config.ts` passes it to `moduleBuild` as `thumbnail`; the build copies it beside the
  manifest and names it there. Without one the build warns, and the card shows a blank picture.

## Try it inside Controllerist

Before it is listed, try it in the real Controllerist, on your own computer:

```bash
npm run build:module      # or: npx vite build -c vite.module.config.ts --watch (in another terminal)
npm run controllerist         # opens https://localhost:8090/?devModule=/m-dev/<id>/module/<id>.json
```

`npm run controllerist` (the engine's `alive-module controllerist`) is a small server on this computer that is
Controllerist's site as far as the browser can tell: `/m-dev/<id>/` comes from your `dist/`, everything
else from the deployed Controllerist. It has to be one site: your bundle imports three.js and the
engine from `/shared/`, and only Controllerist's own copies there are the ones its clock, systems and
panels live in.

- The module gets a **DEV** card in the Instruments browser (the desktop bar's Instruments
  button, or the launcher's: left palm toward you, pinch), for that page load only. Or in the console: `__worlds.modules.summon("<id>")`;
  `__worlds.modules.status()` says how it went.
- Rebuild and reload the page to try a change (your files are never cached).
- **For developers only.** Controllerist accepts a module under development only on a page served
  from this computer (`localhost`), opened with `?devModule=`; the live site and network
  addresses refuse it. So nothing you try this way can reach anyone else's Controllerist.
- **On a headset:** connect it by USB, run `adb reverse tcp:8090 tcp:8090`, and open the same
  `https://localhost:8090/?devModule=...` address in its browser.
- **Multiplayer:** a development page's rooms meet only other development pages: test with a
  second browser window, or a second developer running `npm run controllerist` with the same module.
- Try the module in a local Controllerist instead of the deployed one:
  `CONTROLLERIST_URL=https://localhost:8087 NODE_EXTRA_CA_CERTS=~/.vite-plugin-mkcert/rootCA.pem npm run controllerist`.
- With the id of a module already listed, your build stands in for the listed one on that page
  (trying a new version).

## Publishing: you host it, Controllerist pulls it in

The author hosts the built module; Controllerist's makers list it, and Controllerist then loads it from
the author's address into its worlds. A module never appears in Controllerist until it is listed.

1. **Build on your own machine**: `npm run build`. (A hosted build service cannot fetch the
   engine, which is private, so do not set one up to build for you.)
2. **Publish the contents of `dist/`** on any static web host with HTTPS and a stable address:
   GitHub Pages, Netlify, Cloudflare Pages, Vercel, a bucket. No server code is needed. Keep
   the folders as built: `module/` (the bundle and manifest) and `ui/` (panel markup) side by
   side, plus any other public files of yours. The module finds its files relative to its own
   address, so the site may live under a sub-path (`https://you.github.io/my-module/`).
   For GitHub Pages this repo has `npm run publish:pages` (the engine's `alive-module
   publish-pages`): it builds and pushes the module's
   files (without the test page) to the `gh-pages` branch. Turn Pages on once in the repo's
   Settings > Pages (branch `gh-pages`, folder `/`). A Pages site is public even when the repo
   is private.
3. **Check the address**: `<your site>/module/<id>.json` must open in a browser and show the
   manifest (with its `"thumbnail"`), and `<your site>/module/<id>.js` and
   `<your site>/module/<id>-thumbnail.jpg` must load.
4. **Send Controllerist's makers** the manifest address, the public repo and the commit it was
   built from, and a line on what the module does. They review it, try it on a headset and
   list it. Choose the id with them: it must not clash with a module already listed.
5. **Updates**: what is listed is what was reviewed. Tell them before you publish a change to
   the same address; do not replace the files unannounced.

Tell the user these steps when the module is ready; do not deploy anything for them unless
they ask.

What Controllerist's makers do to list it (in the Controllerist repo, not yours): add one entry to its
registry, `modules.json`, with your module's `id`, `name` and the `url` of your site, and run
`npm run modules:sync`. Controllerist then serves your module through its own site (so your host
needs no CORS settings) and gives it a card, with your thumbnail, in its Instruments browser. It loads only if the manifest at your address
gives exactly the registered `id` and `name`: do not change either after sending them.

They also run `await __leakCheck("<id>", 3)` and `await __instanceCheck("<id>")` on a page
opened with `?leakCheck`.

## Before you say it is done

- [ ] `npm run check` and `npm run build` pass, with no bundling warning and no missing-thumbnail warning.
- [ ] `thumbnail.jpg` is a picture of your module (not the metronome's): 16:9, 480 x 270.
- [ ] The manifest (`dist/module/<id>.json`) has a `contract` number and its `shared` list names
      `@engine/api/module` (and `@engine/api/iwsdk/module` if you use it): ideally no other
      `@engine/` file. (The build stops if it bundles an engine file.)
- [ ] `npm run check:removal` says "Clean".
- [ ] It works inside Controllerist with `npm run controllerist`: its panel shows, it keeps time with
      the decks, and removing it leaves nothing behind.
- [ ] No `new AudioContext()` when `context.audio` exists; sound goes to the mix bus channel.
- [ ] It joins the music clock if it keeps time: claims, publishes, follows and releases as above.
- [ ] Nothing is timed by timers or frames; rhythm plays through the audio sequencer (`createSequencerTrack`).
- [ ] Lights and playheads read `heardBeatAt()`; live presses use `stepPlayedAt()`.
- [ ] A voice of your own: `*.worklet.ts`, only `voiceApi` imported, no allocation in `render`,
      `voiceLoad()` well under 0.1 on a headset.
- [ ] Saved data goes through `context.storage` (or `context.storageKey()`).
- [ ] Controls and buttons say whose they are with `owner: context.instance`.
- [ ] If its things take a moment to stand where they should, `install()` returns `placed`.
- [ ] In a room: grab-detection controls have a `sync` id; other shared things are
      `context.room.state` (changed by presses, applied in its subscription); live notes and
      pads go through `playTogether`; only the host's copy claims the master; `"local-render"`
      if every copy can play itself; what a guest can't press looks it (`room.canPlay()`).
- [ ] No literal `/ui/...` or other root-relative address of your own files.
- [ ] `dispose()` stops sound, nulls big top-level state and deletes any `window.__` globals
      (name such hooks `__...`: the scope only clears those).
- [ ] Remove and install again works on the test page, several times.
- [ ] The user has been told how to publish it and what to send Controllerist's makers.
````
