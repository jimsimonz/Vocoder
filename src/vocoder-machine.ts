/**
 * The VX-16 vocoder: a six-voice synth (the carrier) played from its keyboard, shaped by the
 * player's voice through the microphone (the modulator), with eight sounds in memory, HOLD and an
 * arpeggiator on the page's music clock. No UI here (vocoder-machine-3d.ts is the instrument you touch).
 *
 *   keys -> the carrier (carrier.worklet.ts, the engine's sequencer track) -.
 *                                                                           +-> the vocoder (vocoder.worklet.ts) -> its channel
 *   microphone (the engine's openMicrophone, MIC ON) ----- blocks, by port -'
 *
 * - The carrier is our own voice on the engine's audio sequencer (a key played live goes straight
 *   to it; the arpeggio is a note pattern the sequencer plays on the exact sample). Its track plays
 *   into the vocoder's node rather than the channel.
 * - The microphone is opened only when MIC ON is pressed (the browser asks the first time), with the
 *   engine's openMicrophone (echo cancelling on, so what the speakers play isn't heard as the voice),
 *   and every block goes to the vocoder's node with its frame on this context.
 * - Sliders and switches become the carrier's and the vocoder's parameters, which each smooths.
 *
 * In a multiplayer room the keys, the switches and the sliders are shared as on any of our synths
 * (playTogether, room.state, synced controls), but the sound is the host's: the voice that shapes it
 * is the host's microphone, which only the host's page has. So the room hears the host's stream
 * ("host-stream"), a guest's copy stays silent, and MIC ON is the host's (or a player alone).
 */
import type { ModuleContext } from "@engine/api/module";
import { createSequencerTrack, loadVoice, type SequencerTrack } from "@engine/api/module";
import { playTogether } from "@engine/api/module";
import { retempo, type ClockBeat } from "@engine/api/module";
import { channelSound, extraStrips, onInstanceStrips, openMicrophone, type Microphone } from "@engine/api/module";
// Our carrier's voice, built as a file of its own for the audio thread (carrier.worklet.ts).
import polyVoiceUrl from "./carrier.worklet.ts?worker&url";
// The vocoder's processor, one self-contained file too (vocoder.worklet.ts).
import vocoderUrl from "./vocoder.worklet.ts?worker&url";
import { ARP_MODES, ARP_RATES, arpPattern } from "./arp";
import { arpTempo, buttonById, buttonLit, decodePanel, pressButton, sliderById, stepOf, switchById, valueOfStep, vocoderParams, voiceParams } from "./patch";
import { PRESETS } from "./presets";

export interface VocoderState {
  arp: boolean;
  hold: boolean;
  /** The arpeggio is playing. */
  arpRunning: boolean;
  /** Keys sounding or arpeggiated now. */
  notes: number[];
  /** The microphone is open (MIC ON), and how loud it is (0..1, after its gain). */
  mic: boolean;
  micLevel: number;
  /** The arranger's Microphone track is the voice too (ARRANGER), and how many such tracks it found. */
  arranger: boolean;
  arrangerTracks: number;
  /** This page may open the microphone (alone, or the room's host: the room hears the host's). */
  micAllowed: boolean;
  /** The sound last called from memory (1 to 8; 0: none) and its name. */
  preset: number;
  presetName: string;
  /** This player may play the keys, buttons, sliders and wheels now (false: a guest in a performance room). */
  canPlay: boolean;
}

export type VocoderMachine = ReturnType<typeof createVocoderMachine>;

/** The microphone counts as heard above this level (after GAIN, 0..1): the lesson's "you spoke". */
export const HEARD = 0.03;

export function createVocoderMachine(context: ModuleContext) {
  const key = context.storageKey("panel");
  const panel = (() => { try { return decodePanel(JSON.parse(localStorage.getItem(key) ?? "null")); } catch { return decodePanel(null); } })();
  const { sliders, switches } = panel;

  // The room (or, outside one, just this copy). The host's copy is the room's: a guest plays the
  // host's sound while their own saved one stays in their storage, untouched.
  const room = context.room;
  // The room hears the host's page: the voice that shapes the sound is only there.
  room.setSound("host-stream");
  /** This copy's panel is its player's own to keep (not a guest's copy of the host's). */
  const mine = () => room.role() !== "audience";
  const sharedSwitches = room.state<Record<string, number>>("switches", { ...switches });

  let saveTimer = 0;
  const save = () => {
    if (!mine()) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { try { localStorage.setItem(key, JSON.stringify({ sliders, switches })); } catch { /* not kept */ } }, 400);
  };

  let ctx: AudioContext | null = null;
  let seq: SequencerTrack | null = null;
  let making: Promise<void> | null = null;
  /** Keys held down now, and the ones HOLD keeps (they sound, or arpeggiate, on after being let go). */
  const held = new Set<number>();
  const kept = new Set<number>();
  let arpRunning = false;
  /** The arpeggio's own clock, for when nothing on the page is keeping time. */
  let own: ClockBeat | null = null;
  let pitchBend = 0, modWheel = 0;
  /** How a preset's sliders are moved: the 3D machine's synced sliders, once it is there. */
  let moveSlider: (id: string, value: number) => void = (id, value) => api.setSlider(id, value);
  const listeners = new Set<() => void>();
  const changed = () => { for (const fn of [...listeners]) fn(); };

  /** The vocoder's node on the audio thread, and the gain after it (0 on a guest's copy: the room hears the host's). */
  let node: AudioWorkletNode | null = null;
  let out: GainNode | null = null;
  let mic: Microphone | null = null;
  let stopListening: (() => void) | null = null;
  let opening = false;
  let micLevel = 0;

  const sendParams = () => {
    seq?.setParams({ ...voiceParams(sliders, switches), pitchBend, modWheel });
    node?.port.postMessage({ type: "params", params: vocoderParams(sliders) });
  };
  /** A guest's copy is silent (the host's stream is the sound); alone or hosting it plays. */
  const heardHere = () => room.role() !== "audience";
  const setOut = () => { if (out && ctx) out.gain.setTargetAtTime(heardHere() ? 1 : 0, ctx.currentTime, 0.02); };
  let shownRole = room.role();
  const roleTimer = window.setInterval(() => {
    if (room.role() === shownRole) return; // (nothing to do while it stays the same)
    shownRole = room.role();
    setOut();
    if (!heardHere() && mic) closeMic(); // (no longer the host)
    if (!heardHere() && arrangerOn) { arrangerOn = false; untapArranger(); changed(); }
  }, 1000);

  /** The vocoder's processor, once per audio context. */
  const loadVocoder = (c: AudioContext): Promise<void> => {
    const holder = c as unknown as { __controlleristVocoder?: Promise<void> };
    if (!holder.__controlleristVocoder) {
      holder.__controlleristVocoder = c.audioWorklet.addModule(vocoderUrl);
      holder.__controlleristVocoder.catch(() => { delete holder.__controlleristVocoder; });
    }
    return holder.__controlleristVocoder;
  };

  /**
   * MIC ON is where it starts (a vocoder is for singing into): the microphone opens with the first
   * touch of the instrument (a key, a button: the browser wants a press for sound and asks for the
   * microphone the first time), and stays as the player left it next time (MIC ON pressed off is kept).
   */
  const micKey = context.storageKey("micOn");
  let micWanted = (() => { try { return localStorage.getItem(micKey) !== "0"; } catch { return true; } })();
  const keepMicWanted = (on: boolean) => { micWanted = on; try { localStorage.setItem(micKey, on ? "1" : "0"); } catch { /* not kept */ } };
  /** A touch of the instrument: the microphone opens now if it is wanted and isn't yet. */
  const micOnTouch = () => { if (micWanted && !mic && !opening && heardHere()) void openMic(); };

  const closeMic = () => {
    stopListening?.(); stopListening = null;
    mic?.close(); mic = null;
    node?.port.postMessage({ type: "micOff" });
    micLevel = 0;
    changed();
  };
  /** MIC ON: open the microphone (from a press: the browser asks the first time) and send its blocks to the vocoder. */
  const openMic = async () => {
    if (mic || opening || !heardHere()) return;
    opening = true;
    try {
      const c = await ensureAudio();
      if (!c || !node) return;
      const m = await openMicrophone(c, { echoCancellation: true });
      if (disposed || !micWanted) { m.close(); return; } // (turned off while it was opening)
      mic = m;
      // Live where the container has it (contract 14): the microphone's own node into the vocoder's
      // second input, with nothing between. Else its blocks, by port, stamped with their frame.
      const live = (m as { live?: () => AudioNode }).live;
      if (typeof live === "function") {
        const src = live.call(m);
        src.connect(node, 0, 1);
        console.log("[Vocoder] the microphone, live");
        stopListening = () => { try { src.disconnect(); } catch { /* gone */ } };
      } else {
        console.log("[Vocoder] the microphone, in blocks (an older container: a little behind)");
        stopListening = m.listen((frame, samples) => {
          const copy = samples.slice(); // (shared with other listeners)
          node?.port.postMessage({ type: "mic", frame, samples: copy }, [copy.buffer]);
        });
      }
    } catch (e) {
      console.warn("[Vocoder] no microphone:", e);
      problem = "The microphone isn't available here. Allow it for this site and press MIC ON again.";
      micWanted = false; // (not asked again at every touch; MIC ON tries again)
    } finally {
      opening = false;
      changed();
    }
  };
  let problem = "";
  let disposed = false;

  // ARRANGER: the arranger's Microphone track (what was sung, played back) into the vocoder's voice
  // input, beside the live microphone. Followed as the arranger's tracks come and go.
  let arrangerOn = false;
  let arrangerTaps: AudioNode[] = [];
  const untapArranger = () => {
    for (const n of arrangerTaps) { try { n.disconnect(node!); } catch { /* gone */ } }
    arrangerTaps = [];
  };
  const tapArranger = () => {
    untapArranger();
    if (!arrangerOn || !node) return;
    for (const s of extraStrips().filter((x) => x.microphone)) {
      const sound = channelSound(s.channel);
      if (!sound || sound.context !== node.context) continue;
      sound.connect(node, 0, 1);
      arrangerTaps.push(sound);
    }
    changed();
  };
  const stopStrips = onInstanceStrips(() => { if (arrangerOn) tapArranger(); });
  const setArranger = async (on: boolean) => {
    arrangerOn = on;
    if (on && !(await ensureAudio())) { arrangerOn = false; changed(); return; }
    tapArranger();
    if (on && !arrangerTaps.length) problem = "There's no Microphone track in the arranger yet. Record your voice on it, then play it back.";
    changed();
  };

  /** The container's audio context (the first call needs a user gesture), with our voice and track on it. */
  const ensureAudio = async (): Promise<AudioContext | null> => {
    const c = context.audio ? await context.audio.ensure() : (ctx ?? new AudioContext({ latencyHint: "interactive" }));
    if (!c) return null;
    if (c !== ctx || !seq) {
      ctx = c;
      making ??= (async () => {
        seq?.dispose();
        await loadVoice(c, polyVoiceUrl); // once per context: our voice on the audio thread
        await loadVocoder(c);
        untapArranger(); // (from the old node)
        node?.disconnect(); out?.disconnect();
        node = new AudioWorkletNode(c, "controllerist-vocoder-2", { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
        // The microphone's level, ten times a second: kept, and told only when the voice comes or
        // goes (a change redraws the machine's lights: not ten times a second on the game's thread).
        node.port.onmessage = (e: MessageEvent<number>) => {
          const level = Math.min(1, e.data), was = micLevel > HEARD;
          micLevel = level;
          if ((level > HEARD) !== was) changed();
        };
        out = c.createGain();
        out.gain.value = heardHere() ? 1 : 0;
        node.connect(out).connect(context.audio ? context.audio.output(c) : c.destination);
        // The carrier plays into the vocoder, not the channel.
        const made = await createSequencerTrack({ id: context.instance, context: c, voice: "vocoder-carrier-1", destination: node });
        made.onVoiceError((e) => console.warn(`[Vocoder] the voice was muted (${e.reason}): ${e.message}`));
        seq = made;
        sendParams();
        if (arrangerOn) tapArranger();
      })().finally(() => { making = null; });
      await making.catch(() => { /* tried again on the next press */ });
    }
    return seq ? c : null;
  };

  const arpOn = () => switches.arp === 1;
  const holdOn = () => switches.hold === 1;
  /** The keys that sound (or that the arpeggio plays): held, and with HOLD the ones it keeps. */
  const soundingKeys = (): number[] => (holdOn() ? [...new Set([...kept, ...held])] : [...held]);

  /** Start, change or stop the arpeggio to match the keys and the panel. */
  const updateArp = () => {
    if (!seq || !ctx) return;
    const pattern = arpOn() ? arpPattern(soundingKeys(), ARP_MODES[switches.arpMode] ?? "up", switches.arpRange + 1, ARP_RATES[stepOf(sliders.arpRate, 3)]) : null;
    if (!pattern) {
      if (arpRunning) { seq.stop(); arpRunning = false; changed(); }
      return;
    }
    seq.setNotes(pattern); // from the next step
    if (!arpRunning) {
      // Its own time, for when nothing on the page keeps time (it follows a master by itself).
      own = { originTime: ctx.currentTime + 0.03, bpm: arpTempo(sliders.arpTempo) };
      seq.setClock(own);
      seq.play();
      arpRunning = true;
      changed();
    }
  };

  /** A key goes down on this copy (anyone's, from the room): played at once, or added to the arpeggio. */
  // `scheduled`: its sound is already on the audio thread (a sequencer's note, arpeggio off): only the key shows.
  /**
   * Each key-down's number, per note: after waiting for the audio, a press sounds only if it is
   * still the newest press of its note (and the key is still down). Hammered, two presses could both
   * finish waiting after the next one began, and both sounded: two notes on, one off, one hung.
   */
  const pressOf = new Map<number, number>();
  let presses = 0;
  const keyDownHere = async (note: number, scheduled = false) => {
    const press = ++presses;
    pressOf.set(note, press);
    // HOLD: the first key of a new chord lets the chord it kept go.
    if (holdOn() && !scheduled) {
      if (held.size === 0) {
        for (const n of kept) if (n !== note && !arpOn()) seq?.noteOff(n);
        kept.clear();
      }
      kept.add(note);
    }
    held.add(note);
    changed();
    if (!scheduled) micOnTouch();
    if (scheduled || !(await ensureAudio())) return;
    if (pressOf.get(note) !== press) return; // a newer press of this note sounds instead
    if (arpOn()) updateArp();
    else if (held.has(note)) seq?.noteOn(note);
  };
  /** A key comes up on this copy. */
  const keyUpHere = (note: number, scheduled = false) => {
    if (!held.delete(note)) return;
    changed();
    if (scheduled) return;
    if (holdOn() && kept.has(note)) return; // it sounds on
    if (arpOn()) updateArp();
    else seq?.noteOff(note);
  };
  // Keys for the whole room: each press and release is played by every copy, through the keys
  // above (so held keys, HOLD and the arpeggio follow on every copy, not just the voice). Not
  // quantised for the one playing (grid 0: heard at once); a copy it reaches after its beat plays
  // it on the next sixteenth.
  // A step sequencer's notes come ahead with their beat: to the voice on their exact sample, unless
  // the arpeggio is on (it makes its own notes from the keys held: those keys come as before).
  const live = playTogether(room, {
    schedule: () => {}, trigger: () => {}, // (no pads)
    cancelNotes: (notes) => seq?.cancelNotes(notes),
    scheduleNotes: (keys) => { if (!seq || arpOn()) return false; seq.scheduleNotes(keys); return true; },
    noteOn: (note, o) => { void keyDownHere(note, o?.scheduled); },
    noteOff: (note, o) => keyUpHere(note, o?.scheduled),
  }, { grid: 0 });

  /** A switch's change on this copy (from the shared state): what it does to the sound and the arpeggio. */
  const switchChanged = (id: string) => {
    if (id === "hold") {
      if (holdOn()) for (const n of held) kept.add(n);
      else {
        // Let go of what it kept (the keys still down play on).
        for (const n of kept) if (!held.has(n) && !arpOn()) seq?.noteOff(n);
        kept.clear();
      }
      updateArp();
    } else if (id === "arp") {
      // Keys sounding as it changes: from live to arpeggiated, or back.
      if (arpOn()) { for (const n of soundingKeys()) seq?.noteOff(n); updateArp(); }
      else { updateArp(); for (const n of soundingKeys()) seq?.noteOn(n); }
    } else if (id === "arpMode" || id === "arpRange") updateArp();
    else if (id !== "bank" && id !== "preset") sendParams();
  };
  // Every change to the switches, made here or by anyone in the room, is applied here.
  const applySwitches = (next: Record<string, number>) => {
    let any = false;
    for (const [id, v] of Object.entries(next)) {
      if (switches[id] === v || !switchById(id)) continue;
      switches[id] = v;
      switchChanged(id);
      any = true;
    }
    if (!any) return;
    save();
    changed();
  };
  sharedSwitches.subscribe(applySwitches);
  applySwitches(sharedSwitches.get());

  const api = {
    state: (): VocoderState => ({
      arp: arpOn(), hold: holdOn(), arpRunning, notes: soundingKeys(),
      mic: !!mic, micLevel, micAllowed: heardHere(), arranger: arrangerOn, arrangerTracks: arrangerTaps.length,
      preset: switches.preset, presetName: PRESETS[switches.preset - 1]?.name ?? "", canPlay: room.canPlay(),
    }),
    onChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Is this key held down on this copy (by anyone in the room), or kept by HOLD? */
    isHeld: (note: number): boolean => held.has(note) || (holdOn() && kept.has(note)),

    /** A key goes down: for everyone (false when this player may not play now). */
    keyDown(note: number, beat?: number): boolean { return live.noteOn(note, { beat }); },
    /** A key comes up. */
    keyUp(note: number, beat?: number, flush?: boolean): boolean { return live.noteOff(note, { beat, flush }); },

    slider: (id: string): number => sliders[id] ?? sliderById(id)?.def ?? 0.5,
    /** Where a slider shows: a stepped one sits on its position's middle. */
    shownSlider(id: string): number {
      const spec = sliderById(id), v = sliders[id] ?? spec?.def ?? 0.5;
      return spec?.steps ? valueOfStep(stepOf(v, spec.steps.length), spec.steps.length) : v;
    },
    /**
     * Move a slider (0..1). Heard within a few milliseconds; saved shortly after it stops moving.
     * The sliders are synced controls: in a room this runs on every copy.
     */
    setSlider(id: string, value: number) {
      const spec = sliderById(id);
      if (!spec || !Number.isFinite(value)) return;
      const v = Math.min(1, Math.max(0, value));
      const before = spec.steps ? stepOf(sliders[id], spec.steps.length) : sliders[id];
      sliders[id] = v;
      const after = spec.steps ? stepOf(v, spec.steps.length) : v;
      save();
      if (before === after) return;
      if (id === "arpTempo") { if (own && ctx && arpRunning) { own = retempo(own, arpTempo(v), ctx.currentTime); seq?.setClock(own); } }
      else if (id === "arpRate") updateArp();
      else sendParams();
      changed();
    },

    switchValue: (id: string): number => switches[id] ?? switchById(id)?.def ?? 0,
    /** Is this button lit now? */
    lit: (buttonId: string): boolean => {
      const spec = buttonById(buttonId);
      if (spec?.kind === "mic") return !!mic || (micWanted && heardHere() && !problem); // its own: open, or to open at the first touch
      if (spec?.kind === "arranger") return arrangerOn;
      return !!spec && buttonLit(spec, switches);
    },
    /**
     * Press a button. For everyone: its switch is shared state. A memory number also loads that
     * sound: its switches with the press, its sliders moved one by one (as synced controls).
     */
    press(buttonId: string): boolean {
      const spec = buttonById(buttonId);
      if (spec?.kind === "mic") {
        // This page's own microphone: never the room's (a guest's copy has none to give).
        if (!heardHere()) return false;
        problem = "";
        // Lit (open, or to open at the first touch): off. Else on.
        if (mic || (micWanted && !problem)) { keepMicWanted(false); closeMic(); }
        else { keepMicWanted(true); void openMic(); }
        return true;
      }
      if (spec?.kind === "arranger") {
        if (!heardHere()) return false;
        problem = "";
        void setArranger(!arrangerOn);
        return true;
      }
      if (!spec || !room.canPlay()) return false;
      const sound = spec.kind === "preset" ? PRESETS[spec.value - 1] : null;
      if (!sharedSwitches.update((v) => ({ ...pressButton(spec, { ...switches, ...v }), ...(sound?.switches ?? {}) }))) return false;
      if (sound) for (const [id, value] of Object.entries(sound.sliders)) moveSlider(id, value);
      return true;
    },
    /** The 3D machine's way of moving a slider (through its synced callback, so the room follows); null: directly. */
    setSliderMover(fn: ((id: string, value: number) => void) | null) { moveSlider = fn ?? ((id, value) => api.setSlider(id, value)); },

    /** The bend lever, -1 to 1 (how far it bends: the BENDER sliders). A synced control: in a room, on every copy. */
    setPitchBend(v: number) { pitchBend = Math.max(-1, Math.min(1, v)); seq?.setParams({ pitchBend }); },
    /** The mod wheel, 0..1: how much the LFO moves the pitch, at once (no delay). Synced too. */
    setModWheel(v: number) { modWheel = Math.max(0, Math.min(1, v)); seq?.setParams({ modWheel }); },

    /** Make the audio ready (a press anywhere on the machine is a gesture). */
    wake: () => { void ensureAudio(); micOnTouch(); },
    /** The voice's share of the audio thread, as the engine measures it (null before any sound). */
    voiceLoad: (): unknown => (seq as unknown as { voiceLoad?: () => unknown } | null)?.voiceLoad?.() ?? null,

    /** For automated checks: the vocoder's output level now (RMS, from an analyser made when first asked). */
    outLevel(): number {
      if (!out || !ctx) return 0;
      const holder = out as unknown as { __probe?: AnalyserNode };
      if (!holder.__probe) { holder.__probe = ctx.createAnalyser(); holder.__probe.fftSize = 2048; out.connect(holder.__probe); }
      const a = new Float32Array(2048);
      holder.__probe.getFloatTimeDomainData(a);
      let sum = 0; for (const v of a) sum += v * v;
      return Math.sqrt(sum / a.length);
    },
    /** Why MIC ON didn't open the microphone, for showing ("" when nothing went wrong). */
    problem: (): string => problem,

    dispose() {
      disposed = true;
      clearInterval(roleTimer);
      closeMic();
      stopStrips();
      untapArranger();
      clearTimeout(saveTimer);
      if (mine()) { try { localStorage.setItem(key, JSON.stringify({ sliders, switches })); } catch { /* not kept */ } }
      live.stop();
      seq?.stop({ cut: true });
      seq?.dispose();
      seq = null;
      node?.disconnect(); out?.disconnect();
      node = null; out = null;
      held.clear();
      kept.clear();
      listeners.clear();
    },
  };
  return api;
}
