/**
 * The VX-16 vocoder as a feature module: what a container (Controllerist) loads by address and installs
 * into the world it is already running. This file's default export is the whole contract.
 *
 * Left to the container: the world, the XR session, the audio context and mix bus, and grab
 * detection (hands and controllers play the keys and move the sliders through it). Taking the
 * module out is mostly the scope's: everything this code makes (the sequencer track and its voice,
 * the system, the 3D machine) is recorded there and released.
 */
import "./i18n";
import type { World } from "@iwsdk/core";
import type { FeatureModule, InstalledModule, ModuleContext } from "@engine/api/module";
import { createVocoderMachine } from "./vocoder-machine";
import { vocoderLesson } from "./lesson";
import { VocoderMachine3DSystem, setMachineModel } from "./vocoder-machine-3d";
import { showMessage } from "@engine/api/iwsdk/module";

async function install(world: World, context: ModuleContext): Promise<InstalledModule> {
  const machine = createVocoderMachine(context);
  setMachineModel({ machine, context });
  world.registerSystem(VocoderMachine3DSystem);
  // A MIDI keyboard (the container sends it to the instrument the player stands nearest to): its
  // keys play these keys, for the whole room, exactly as a press on the 3D keyboard does.
  // A step sequencer's notes (another module's note output) carry their beat: played on it, for the room.
  // A flush (the sequencer stopped or was removed): the note ends now, whatever was still scheduled for it.
  context.midi.onNote(({ on, note, beat, flush }) => { if (on) machine.keyDown(note, beat); else machine.keyUp(note, beat, flush); }, { early: true });
  const body = () => world.getSystem(VocoderMachine3DSystem);
  // Its lesson: the container's guide teaches its first words (the "?" after the M and S). No voice
  // clips yet: a desktop browser speaks the lines, a headset shows them.
  context.lessons.add(vocoderLesson(machine, body));
  // MIC ON that couldn't open the microphone: say why, once each time.
  let told = "";
  const stopTelling = machine.onChange(() => {
    const p = machine.problem();
    if (p && p !== told) showMessage({ icon: "🎤", title: "No microphone", body: p, autoDismissMs: 6000 });
    told = p;
  });
  return {
    place: (anchor) => body()?.show(anchor),
    placement: () => body()?.placement() ?? null,
    setPlacement: (placement) => body()?.setPlacement(placement),
    moveBy: (move) => body()?.moveBy(move),
    // For a container's automated checks only (no key presses there).
    test: {
      keyDown: (note: number) => machine.keyDown(note), keyUp: (note: number) => machine.keyUp(note),
      press: (id: string) => machine.press(id), setSlider: (id: string, v: number) => machine.setSlider(id, v),
      slider: (id: string) => machine.slider(id), state: () => machine.state(), voiceLoad: () => machine.voiceLoad(),
      mic: () => machine.press("mic"), outLevel: () => machine.outLevel(),
    },
    dispose() {
      stopTelling();
      machine.dispose(); // audibly first: the notes stop
      setMachineModel(null);
    },
  };
}

export default { id: "vocoder", install } satisfies FeatureModule<World>;
