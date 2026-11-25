/**
 * The VX-16 vocoder as a 3D object in the world: a blue-grey front panel between wooden cheeks, one
 * slider per function under coloured section headings (pinch a cap and slide it; a stepped one
 * clicks between positions), buttons with a light over each (MIC ON lights while the microphone is
 * open), eight sounds on the memory buttons, a bend
 * lever and a mod wheel you pinch and slide (the lever springs back), and a five-octave keyboard
 * you play with your fingertips: a key sounds while it is held down and stops when you lift off.
 *
 * Input is the engine's: the container's grab detection (hand tracking and controllers) presses
 * the keys and buttons, moves the sliders and wheels and carries the machine. On a flat screen the
 * mouse does the same (hold a key down, click a button, drag a slider or wheel up and down).
 * Nothing here times sound: a key is a call into the machine (vocoder-machine.ts).
 *
 * Draw calls: body, faceplate, two cheeks, handle, key and button caps (one instanced mesh per cap
 * shape), slider caps, wheel caps and lights (one each). Per frame it only moves what changed.
 */
import { createSystem } from "@iwsdk/core";
import type { Material } from "three";
import {
  BoxGeometry, BufferAttribute, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, Raycaster, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3,
  type BufferGeometry,
} from "three";
import type { ModuleContext } from "@engine/api/module";
import { getGrabDetection, type GrabDetectionSystem } from "@engine/api/module";
import { addSoloMuteButtons } from "@engine/api/iwsdk/module";
import type { ButtonMetadata, GrabbableControlMetadata } from "@engine/api/module";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VocoderMachine } from "./vocoder-machine";
import { capRoughnessMap, capWearMap } from "./machine/wear";
import { PooledParts } from "./machine/pooled";
import { drawFaceplate, drawWood } from "./machine/faceplate";
import {
  BODY, BUTTON_PRESS_AT_M, BUTTON_TRAVEL_M, CHEEK, HANDLE, KEYS, LIGHT, LIGHTS, PRESS_AT_M, SLIDER, SLIDES, sliderValue, sliderZ, TRAVEL_M,
  MIC_BOOM, micBoomX, WHEEL, WHEELS, wheelValue, wheelZ, type KeySpec, type SlideSpec,
} from "./machine/layout";


/** Where the M and S go: just inside the top right corner of the top face (MODULES.md). */
const SOLO_MUTE_CORNER = { x: BODY.width / 2, z: -BODY.depth / 2 };
/**
 * The machine is drawn at four fifths of its layout's size (layout.ts is in its own metres, a real
 * keyboard's: at full size its metre of width stood too big in front of you). Everything in the
 * machine's space scales with it; what the engine measures in world metres (a key's cap height
 * and firing depth) is scaled here. Two hands can still scale it up.
 */
export const SCALE = 0.8;
const PLACE_XR = { ahead: 0.6, below: 0.55, tilt: 0 }, PLACE_SCREEN = { ahead: 1.2, below: 0.2, tilt: 0.85 };
/** Key caps stand this far (m, the layout's) above the panel's surface, so their bottoms never share its plane. */
const CAP_LIFT = 0.0008;
const SLIDER_DRAG_PX = 150, WHEEL_DRAG_PX = 120;
/** The pitch wheel springs back to the middle this fast when let go (fraction a frame). */
const SPRING = 0.35;

const COLOR = {
  body: 0x222833, handle: 0x141920,
  white: 0xeeeae0, black: 0x171a1f, keyDown: 0x3fd3c6,
  button: 0xcdd4da, memory: 0xe08a42, bank: 0x1f9e95, power: 0xb8382a, wheel: 0x74777c,
  lightOff: 0x0b2624, lightOn: 0x3ff0de,
};

let model: { machine: VocoderMachine; context: ModuleContext } | null = null;
export const setMachineModel = (m: typeof model): void => { model = m; };

/**
 * The caps' wear, per key: a per-instance offset into the wear texture (the texture is twice the
 * area a key shows), read by a shader patch the engine applies to the pool's standard material.
 */
const CAP_WEAR = {
  attributes: { wear: 2 },
  shader: {
    vertex: [
      { after: "#include <common>", insert: "attribute vec2 wear;" },
      { after: "#include <uv_vertex>", insert: ["#ifdef USE_MAP", "  vMapUv = vMapUv * 0.5 + wear * 0.5;", "#endif"].join(String.fromCharCode(10)) },
    ],
  },
};

/**
 * Every key cap, drawn from the engine's shared instance pools: one pool per cap shape (each at its
 * true size, so the rounded edges stay round), shared by every copy of this module. Numbered as
 * the shapes are given; placed and coloured by number.
 */
class Caps {
  private readonly parts: PooledParts[] = [];
  private readonly slots: { parts: PooledParts; i: number }[] = [];

  constructor(context: ModuleContext, shapes: { w: number; h: number; d: number }[], makeMaterial: () => Material, root: Object3D) {
    const byShape = new Map<string, number[]>();
    shapes.forEach((sh, i) => {
      const key = `${sh.w}x${sh.h}x${sh.d}`;
      byShape.set(key, [...(byShape.get(key) ?? []), i]);
    });
    this.slots = new Array(shapes.length);
    for (const [key, indices] of byShape) {
      const { w, h, d } = shapes[indices[0]];
      const parts = new PooledParts(context, `cap-${key}`, () => ({
        geometry: new RoundedBoxGeometry(w, h, d, 3, Math.min(0.0024, h * 0.32, w * 0.2)),
        material: makeMaterial(),
      }), indices.length, root, CAP_WEAR);
      indices.forEach((index, i) => {
        this.slots[index] = { parts, i };
        parts.setColorAt(i, new Color(0xffffff));
        // Each key its own patch of the wear texture, always the same one (from its number).
        parts.set(i, "wear", (index * 0.618034) % 1, (index * 0.381966 + 0.27) % 1);
      });
      this.parts.push(parts);
    }
  }

  setMatrix(index: number, m: Matrix4) { const sl = this.slots[index]; sl.parts.setMatrixAt(sl.i, m); }
  setColor(index: number, c: Color) { const sl = this.slots[index]; sl.parts.setColorAt(sl.i, c); }
  /** (Pool slots follow their stand-ins: nothing to flush.) */
  matricesDone() {}
  coloursDone() {}
  dispose() { for (const p of this.parts) p.dispose(); }
}

/** A slider's cap: a white block, waisted where the fingers pinch it, with a dark line across its top. */
function sliderCapGeometry(): BufferGeometry {
  const painted = (g: BufferGeometry, hex: number) => {
    const c = new Color(hex), n = g.getAttribute("position").count, data = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { data[i * 3] = c.r; data[i * 3 + 1] = c.g; data[i * 3 + 2] = c.b; }
    g.setAttribute("color", new BufferAttribute(data, 3));
    return g.toNonIndexed();
  };
  const { capW: w, capD: d, capH: h } = SLIDER;
  const foot = new BoxGeometry(w, h * 0.45, d).translate(0, h * 0.225, 0);
  const top = new BoxGeometry(w * 0.86, h * 0.55, d * 0.72).translate(0, h * 0.725, 0);
  const line = new BoxGeometry(w * 0.86, 0.0004, d * 0.14).translate(0, h + 0.0002, 0);
  const parts = [painted(foot, 0xe9e5da), painted(top, 0xf4f1e8), painted(line, 0x1a1a1c)];
  const merged = mergeGeometries(parts)!;
  for (const g of [foot, top, line, ...parts]) g.dispose();
  return merged;
}

interface Key { spec: KeySpec; holder: Object3D; hit: Mesh; pick: Mesh; meta: ButtonMetadata; shown: number; mouseDown: boolean; down: boolean }
/** A slider: what grab detection moves (`holder`, along z), as registered (`meta`, its onValueUpdate wrapped for the room). */
interface Slide { spec: SlideSpec; stepped: boolean; holder: Object3D; hit: Mesh; pick: Mesh; key: number; meta?: GrabbableControlMetadata; shown: number }
/**
 * `meta`: as registered (its onValueUpdate wrapped for the room). `local`: the last move was this
 * player's (their hand, mouse or the spring), so the pitch wheel's spring is ours to run; a move from
 * the room (someone else's hand) leaves the spring to that player's copy, whose values follow.
 */
interface Wheel { id: "pitch" | "mod"; holder: Object3D; hit: Mesh; pick: Mesh; key: number; shownZ: number; meta?: GrabbableControlMetadata; local: boolean }

/** How much of its own colour a key or slider keeps while this player can't touch it (a guest in a performance room). */
const DIMMED = 0.4;

export class VocoderMachine3DSystem extends createSystem({}) {
  private root = new Group();
  private keys: Key[] = [];
  private slides: Slide[] = [];
  private wheels: Wheel[] = [];
  private caps!: Caps;
  private sliderMesh!: PooledParts;
  private lights!: PooledParts;
  /** The ring round the microphone's head: lit while the microphone is open. */
  private micRing: MeshBasicMaterial | null = null;
  private wheelMesh!: PooledParts;
  private grab: GrabDetectionSystem | null = null;
  private grabKeys: number[] = [];
  private controlKeys: number[] = [];
  private dirty = true;
  private shownCanPlay = true;
  /** Set while the spring moves the pitch wheel (a move of this player's). */
  private springing = false;
  private unsubscribe: (() => void) | null = null;
  private stopFollowingXr: (() => void) | null = null;
  private toDispose: { dispose(): void }[] = [];
  private readonly m4 = new Matrix4();
  private readonly m4b = new Matrix4();
  private readonly tmpUp = new Vector3();
  private carried = false;
  private readonly color = new Color();

  init() {
    const m = model;
    if (!m) return;
    this.root.name = `vocoder:${m.context.instance}`;
    // Our footprint, so instruments placed in front of someone make room for each other.
    this.root.userData.instrumentFootprint = { width: (BODY.width + 2 * CHEEK.w) * SCALE, depth: BODY.depth * SCALE };
    this.root.scale.setScalar(SCALE);
    this.build(m);
    this.world.scene.add(this.root);
    this.registerInput(m);
    // MUTE and SOLO at the top right (MODULES.md): the same flags as this instrument's strip on the mixer.
    addSoloMuteButtons(this.world, m.context, { parent: this.root, corner: SOLO_MUTE_CORNER });
    this.unsubscribe = m.machine.onChange(() => { this.dirty = true; });
    this.show(m.context.anchor ?? null);
    this.followXrSessions();
    this.update();
  }

  // ------------------------------------------------------------------ building it

  private build(m: NonNullable<typeof model>) {
    const unitBox = this.own(new BoxGeometry(1, 1, 1));
    const body = new Mesh(unitBox, this.own(new MeshStandardMaterial({ color: COLOR.body, roughness: 0.6, metalness: 0.15 })));
    body.scale.set(BODY.width, BODY.height, BODY.depth);
    body.position.y = -BODY.height / 2 - 0.0005;
    this.root.add(body);

    const faceTex = this.own(new CanvasTexture(drawFaceplate()));
    faceTex.colorSpace = SRGBColorSpace;
    faceTex.anisotropy = 4;
    const face = new Mesh(this.own(new PlaneGeometry(BODY.width, BODY.depth)), this.own(new MeshStandardMaterial({ map: faceTex, roughness: 0.75, metalness: 0.05 })));
    face.rotation.x = -Math.PI / 2;
    this.root.add(face);

    // Wooden cheeks at either end.
    const wood = this.own(new CanvasTexture(drawWood()));
    wood.colorSpace = SRGBColorSpace;
    wood.wrapS = wood.wrapT = RepeatWrapping;
    const woodMat = this.own(new MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0 }));
    for (const side of [-1, 1]) {
      const cheek = new Mesh(unitBox, woodMat);
      cheek.scale.set(CHEEK.w, BODY.height + CHEEK.extra, BODY.depth + 0.01);
      cheek.position.set(side * (BODY.width / 2 + CHEEK.w / 2), (CHEEK.extra - BODY.height) / 2, 0);
      this.root.add(cheek);
    }

    const handle = new Mesh(unitBox, this.own(new MeshStandardMaterial({ color: COLOR.handle, roughness: 0.5 })));
    handle.scale.set(HANDLE.w, HANDLE.h, HANDLE.d);
    handle.position.set(HANDLE.x, HANDLE.y, HANDLE.z);
    this.root.add(handle);
    this.buildMicBoom();

    // Key caps: rounded, worn plastic (see wear.ts), from the engine's shared instance pools. The
    // pool keeps the first copy's material (so: no onBeforeCompile, which would keep that copy's
    // code alive).
    const makeCapMaterial = (): Material => {
      const map = new CanvasTexture(capWearMap());
      map.colorSpace = SRGBColorSpace;
      return new MeshStandardMaterial({ color: 0xffffff, map, roughnessMap: new CanvasTexture(capRoughnessMap()), roughness: 1, metalness: 0 });
    };
    this.caps = new Caps(model!.context, KEYS.map((k) => ({ w: k.w, h: k.h, d: k.d })), makeCapMaterial, this.root);

    this.sliderMesh = new PooledParts(model!.context, "slider", () => ({ geometry: sliderCapGeometry(), material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }) }), SLIDES.length, this.root);

    // A light over every button: unlit boxes, coloured per light.
    this.lights = new PooledParts(model!.context, "light", () => ({ geometry: new BoxGeometry(1, 1, 1), material: new MeshBasicMaterial({ color: 0xffffff }) }), LIGHTS.length, this.root);
    LIGHTS.forEach((l, i) => {
      this.m4.makeScale(LIGHT.w, LIGHT.h, LIGHT.d).setPosition(l.x, LIGHT.h / 2 + 0.0002, l.z);
      this.lights.setMatrixAt(i, this.m4);
      this.lights.setColorAt(i, this.color.set(COLOR.lightOff));
    });

    this.wheelMesh = new PooledParts(model!.context, "wheel", () => ({ geometry: new RoundedBoxGeometry(WHEEL.capW, WHEEL.capH, WHEEL.capD, 3, 0.004), material: new MeshStandardMaterial({ color: COLOR.wheel, roughness: 0.5 }) }), WHEELS.length, this.root);

    const hitMat = this.own(new MeshBasicMaterial({ visible: false }));
    const box = (parent: Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = new Mesh(unitBox, hitMat);
      b.scale.set(w, h, d);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    for (const spec of KEYS) {
      const holder = new Object3D();
      holder.position.set(spec.x, 0, spec.z);
      this.root.add(holder);
      // A fingertip presses where the key is meant to be pressed (a white key: its front only).
      // Above the surface the zone reaches 4 cm up, for the finger coming down. Below it, a
      // keyboard key's zone goes 8 cm down (12 cm at the machine's size), so a finger that sinks
      // through the key keeps holding it: only lifting out or sliding off lets it go. A button's
      // stops 1 cm down. The mouse picks the cap you see.
      const musical = spec.kind === "white" || spec.kind === "black";
      const pad = musical ? -0.001 : 0.005;
      const below = musical ? 0.08 : 0.01, above = musical ? 0.04 : 0.03;
      const hit = box(holder, spec.w + pad, below + above, spec.hitD + pad, 0, (above - below) / 2, spec.hitZ - spec.z);
      const pick = box(holder, spec.w, spec.h, spec.d, 0, spec.h / 2, 0);
      const key: Key = { spec, holder, hit, pick, meta: undefined as unknown as ButtonMetadata, shown: -1, mouseDown: false, down: false };
      key.meta = {
        entity: { object3D: holder }, mesh: holder, boundingBox: hit, iconMesh: hit, type: "vocoder",
        owner: m.context.instance, capTopOffset: spec.h, pressThreshold: musical ? PRESS_AT_M : BUTTON_PRESS_AT_M,
        // The keyboard's keys are one glide group: slide a held finger along them and each key plays.
        ...(musical ? { glide: "keys" } : {}),
        onButtonPush: () => this.press(key),
        onButtonRelease: () => this.lift(key),
        onButtonCancel: () => this.lift(key),
      };
      this.keys.push(key);
    }
    for (const spec of SLIDES) {
      const holder = new Object3D();
      holder.position.set(spec.x, 0, sliderZ(spec.z, m.machine.shownSlider(spec.id)));
      this.root.add(holder);
      // The pinch zone stays inside its own column, so a neighbour's is never taken instead.
      const hit = box(holder, SLIDER.capW + 0.009, 0.05, SLIDER.capD + 0.014, 0, 0.017, 0);
      const pick = box(holder, SLIDER.capW + 0.004, SLIDER.capH, SLIDER.capD + 0.004, 0, SLIDER.capH / 2, 0);
      this.slides.push({ spec, stepped: !!spec.steps, holder, hit, pick, key: 0, shown: NaN });
    }
    for (const w of WHEELS) {
      const holder = new Object3D();
      holder.position.set(w.x, 0, wheelZ(w.id === "pitch" ? 0 : 1)); // mod starts towards you: none
      this.root.add(holder);
      const hit = box(holder, WHEEL.capW + 0.012, 0.06, WHEEL.capD + 0.016, 0, 0.02, 0);
      const pick = box(holder, WHEEL.capW, WHEEL.capH, WHEEL.capD, 0, WHEEL.capH / 2, 0);
      this.wheels.push({ id: w.id, holder, hit, pick, key: 0, shownZ: NaN, local: true });
    }
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.toDispose.push(thing);
    return thing;
  }

  private followXrSessions() {
    const xr = (this.world as unknown as { renderer?: { xr?: { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void } } }).renderer?.xr;
    if (!xr) return;
    const replace = () => { window.setTimeout(() => { if (!this.carried) this.show(null); }, 600); };
    xr.addEventListener("sessionstart", replace);
    xr.addEventListener("sessionend", replace);
    this.stopFollowingXr = () => { xr.removeEventListener("sessionstart", replace); xr.removeEventListener("sessionend", replace); };
  }

  // ------------------------------------------------------------------ input

  private registerInput(m: NonNullable<typeof model>) {
    this.grab = getGrabDetection();
    const base = -Math.floor(1e6 + Math.random() * 1e9);
    this.keys.forEach((k, i) => { this.grab!.registerButton(base - i, k.meta); this.grabKeys.push(base - i); });
    this.slides.forEach((sl, i) => {
      const key = base - 1000 - i;
      sl.key = key;
      // Slid along the machine's depth: away from you is up (10). Synced: in a room it is one slider
      // for everyone (it moves, and setSlider runs, on every copy; a guest who joins gets where it
      // stands). Registering wraps onValueUpdate: the mouse and the memory move it through that too.
      const meta: GrabbableControlMetadata = {
        entity: { object3D: sl.holder }, boundingBox: sl.hit, type: "slider", axis: 2, orientation: "horizontal",
        minPosition: -SLIDER.travel, maxPosition: SLIDER.travel, originalX: sl.spec.x, originalY: 0, originalZ: sl.spec.z,
        valueRange: { min: 0, max: 1 }, owner: m.context.instance, parameter: sl.spec.id,
        getCurrentValue: () => sliderValue(sl.spec.z, sl.holder.position.z),
        onValueUpdate: (v) => m.machine.setSlider(sl.spec.id, v),
        sync: { id: `slider-${sl.spec.id}` },
      };
      this.grab!.registerControl(key, meta);
      sl.meta = meta;
      this.controlKeys.push(key);
    });
    // A sound called from memory moves its sliders as a hand would: here, and (synced) for the room.
    m.machine.setSliderMover((id, value) => {
      const sl = this.slides.find((x) => x.spec.id === id);
      if (!sl?.meta?.onValueUpdate) return m.machine.setSlider(id, value);
      sl.holder.position.z = sliderZ(sl.spec.z, value);
      sl.meta.onValueUpdate(value);
    });
    this.wheels.forEach((w, i) => {
      const key = base - 1500 - i;
      w.key = key;
      // Slid along the machine's depth: away from you is up (more mod, pitch up). Synced: one
      // wheel for the room, moved (and heard) on every copy.
      const meta: GrabbableControlMetadata = {
        entity: { object3D: w.holder }, boundingBox: w.hit, type: "slider", axis: 2, orientation: "horizontal",
        minPosition: -WHEEL.travel, maxPosition: WHEEL.travel, originalX: w.holder.position.x, originalY: 0, originalZ: WHEEL.z,
        valueRange: { min: 0, max: 1 }, owner: m.context.instance, parameter: w.id,
        // A MIDI controller's own wheels move these on the instrument the MIDI goes to (no learning).
        midi: w.id === "pitch" ? "pitchbend" : 1,
        getCurrentValue: () => (1 - wheelValue(w.holder.position.z)) / 2,
        onValueUpdate: (v) => {
          w.local = this.springing || this.mouseOn(w) || !!this.grab?.isGrabbing(key);
          this.wheelMoved(w, v * 2 - 1);
        },
        sync: { id: `wheel-${w.id}` },
      };
      this.grab!.registerControl(key, meta);
      w.meta = meta;
      this.controlKeys.push(key);
    });
    const zone = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const hit = new Mesh(this.keys[0].hit.geometry, this.keys[0].hit.material);
      hit.scale.set(w, h, d);
      hit.position.set(x, y, z);
      return hit;
    };
    const carry = (hit: Mesh, key: number, fallback: boolean) => {
      this.root.add(hit);
      this.grab!.registerControl(key, {
        entity: { object3D: hit }, panelEntity: { object3D: this.root }, boundingBox: hit,
        // The drawn hand stays fixed to the machine where it took hold (the engine's carry pose).
        type: "panel-edge", panelId: `vocoder-${m.context.instance}`, snapPose: "hold",
        ...(fallback ? { grabPriority: "fallback" as const } : {}),
        onRelease: () => { this.carried = true; this.fitPressesToTilt(); },
      });
      this.controlKeys.push(key);
    };
    carry(zone(HANDLE.w + 0.02, 0.06, 0.05, HANDLE.x, HANDLE.y, HANDLE.z - 0.01), base - 2000, false);
    // The cheeks are the natural place to pick it up; the whole casing works too (a fallback zone).
    for (const side of [-1, 1]) carry(zone(CHEEK.w + 0.03, BODY.height + CHEEK.extra + 0.03, BODY.depth + 0.03, side * (BODY.width / 2 + CHEEK.w / 2), 0, 0), base - 2001 - (side + 1), false);
    const below = BODY.height + 0.015, above = 0.025;
    carry(zone(BODY.width + 0.03, below + above, BODY.depth + 0.03, 0, (above - below) / 2, 0), base - 2010, true);
    this.listenToMouse();
  }

  // ------------------------------------------------------------------ for its lesson (lesson.ts)

  /** Where a key's or button's cap is (world): what the guide points at. False: no such key. */
  keyWorldPosition(id: string, out: Vector3): boolean {
    const key = this.keys.find((k) => k.spec.id === id);
    if (!key) return false;
    key.holder.updateWorldMatrix(true, false);
    // A white key: where it is pressed (its front, clear of the black keys).
    key.holder.localToWorld(out.set(0, key.spec.h, key.spec.hitZ - key.spec.z));
    return true;
  }

  /** Where a slider's cap is now (world). */
  sliderWorldPosition(id: string, out: Vector3): boolean {
    const slide = this.slides.find((s) => s.spec.id === id);
    if (!slide) return false;
    slide.holder.updateWorldMatrix(true, false);
    slide.holder.localToWorld(out.set(0, SLIDER.capH, 0));
    return true;
  }

  /** A slider's travel (world): the machine's front-to-back. */
  sliderAxis(out: Vector3): boolean {
    this.root.updateWorldMatrix(true, false);
    out.set(0, 0, 1).transformDirection(this.root.matrixWorld);
    return true;
  }

  /** A key or button goes down. */
  private press(k: Key) {
    const m = model?.machine;
    if (!m) return;
    m.wake();
    // A key: for the whole room (playTogether); held keys light from the machine's (everyone's) held set.
    if (k.spec.note !== undefined) { if (!k.down) { k.down = true; m.keyDown(k.spec.note); this.dirty = true; } return; }
    if (k.spec.id === "power") return model?.context.requestRemoval();
    if (k.spec.button) m.press(k.spec.button.id);
  }

  /** A key comes up (the fingertip lifts off, or the mouse lets go). */
  private lift(k: Key) {
    if (k.spec.note === undefined || !k.down) return;
    k.down = false;
    model?.machine.keyUp(k.spec.note);
    this.dirty = true;
  }

  private wheelMoved(w: Wheel, v: number) {
    const m = model?.machine;
    if (!m) return;
    if (w.id === "pitch") m.setPitchBend(v);
    else m.setModWheel((v + 1) / 2);
  }

  /** On a flat screen: hold keys down, click buttons, drag sliders and wheels up and down. */
  private listenToMouse() {
    const renderer = (this.world as unknown as { renderer?: { domElement: HTMLElement; xr?: { isPresenting: boolean } } }).renderer;
    const el = renderer?.domElement;
    if (!el) return;
    const ray = new Raycaster(), ndc = new Vector2();
    const targets = [...this.keys.map((k) => k.pick), ...this.slides.map((k) => k.pick), ...this.wheels.map((w) => w.pick)];
    let held: Key | null = null;
    let moving: { slide: Slide; startY: number; startValue: number } | null = null;
    let sliding: { wheel: Wheel; startY: number; startZ: number } | null = null;
    const signal = model?.context.scope.signal;
    el.addEventListener("pointerdown", (e) => {
      if (renderer?.xr?.isPresenting) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.world.camera);
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const key = this.keys.find((k) => k.pick === hit.object);
      if (key) { key.mouseDown = true; held = key; this.press(key); return; }
      const canPlay = model?.context.room.canPlay() ?? true; // sliders and wheels: the room's to move, not ours now
      const slide = this.slides.find((k) => k.pick === hit.object);
      if (slide) { if (canPlay) { this.mouseSlide = slide; moving = { slide, startY: e.clientY, startValue: sliderValue(slide.spec.z, slide.holder.position.z) }; } return; }
      const wheel = this.wheels.find((w) => w.pick === hit.object);
      if (wheel && canPlay) { sliding = { wheel, startY: e.clientY, startZ: wheel.holder.position.z }; this.mouseWheel = wheel; }
    }, { capture: true, signal });
    el.addEventListener("pointermove", (e) => {
      if (moving) {
        // Dragging up pushes the cap away from you (towards 10).
        const v = Math.min(1, Math.max(0, moving.startValue + (moving.startY - e.clientY) / SLIDER_DRAG_PX));
        moving.slide.holder.position.z = sliderZ(moving.slide.spec.z, v);
        // Through the (synced) callbacks, so the room hears a mouse move as it does a hand's.
        moving.slide.meta?.onValueUpdate?.(v);
        e.stopImmediatePropagation();
      } else if (sliding) {
        // Dragging up pushes the wheel away from you.
        const z = Math.min(WHEEL.z + WHEEL.travel, Math.max(WHEEL.z - WHEEL.travel, sliding.startZ - ((sliding.startY - e.clientY) / WHEEL_DRAG_PX) * WHEEL.travel));
        sliding.wheel.holder.position.z = z;
        sliding.wheel.meta?.onValueUpdate?.((1 - wheelValue(z)) / 2);
        e.stopImmediatePropagation();
      }
    }, { capture: true, signal });
    const end = () => {
      if (held) { held.mouseDown = false; this.lift(held); held = null; }
      moving = null;
      this.mouseSlide = null;
      sliding = null;
      this.mouseWheel = null;
    };
    el.addEventListener("pointerup", end, { capture: true, signal });
    el.addEventListener("pointercancel", end, { capture: true, signal });
  }

  // ------------------------------------------------------------------ every frame

  update() {
    const m = model?.machine;
    if (!m || !this.caps) return;
    let moved = false;
    this.keys.forEach((k, i) => {
      // Down while this player's hand or mouse holds it, or while anyone in the room does.
      const heldByRoom = k.spec.note !== undefined && !k.down && m.isHeld(k.spec.note);
      const travel = k.spec.note !== undefined ? TRAVEL_M : BUTTON_TRAVEL_M;
      const depth = k.mouseDown || heldByRoom ? travel : Math.min(travel, Math.max(0, (k.meta.pushDepth ?? 0) / SCALE));
      if (Math.abs(depth - k.shown) < 1e-4) return;
      k.shown = depth;
      const s = k.spec;
      // Lifted a hair off the panel: a cap's bottom on the panel's own surface flickers in a headset.
      this.m4.makeTranslation(s.x, s.h / 2 + CAP_LIFT - depth, s.z);
      this.caps.setMatrix(i, this.m4);
      moved = true;
    });
    if (moved) this.caps.matricesDone();

    // Sliders: a stepped one is drawn on its position (it clicks) once the hand or mouse lets go.
    this.slides.forEach((sl, i) => {
      if (sl.stepped && !this.grab?.isGrabbing(sl.key) && this.mouseSlide !== sl) sl.holder.position.z = sliderZ(sl.spec.z, m.shownSlider(sl.spec.id));
      const z = sl.holder.position.z;
      if (z === sl.shown) return;
      sl.shown = z;
      this.sliderMesh.setMatrixAt(i, this.m4.makeTranslation(sl.spec.x, 0.0006, z));
    });

    // Wheels: the pitch wheel springs back to the middle when nobody holds it (on the copy of
    // whoever let it go: the others follow its values).
    this.wheels.forEach((w, i) => {
      if (w.id === "pitch" && w.local && w.holder.position.z !== WHEEL.z && !this.grab?.isGrabbing(w.key) && !this.mouseOn(w)) {
        const z = w.holder.position.z + (WHEEL.z - w.holder.position.z) * SPRING;
        w.holder.position.z = Math.abs(z - WHEEL.z) < 1e-4 ? WHEEL.z : z;
        this.springing = true;
        try { w.meta?.onValueUpdate?.((1 - wheelValue(w.holder.position.z)) / 2); } finally { this.springing = false; }
      }
      const z = w.holder.position.z;
      if (z === w.shownZ) return;
      w.shownZ = z;
      this.m4.makeTranslation(w.holder.position.x, WHEEL.capH / 2 - 0.006, z);
      this.wheelMesh.setMatrixAt(i, this.m4);
    });

    // The room's mode can change (the host's "Guests play"): show what this player may touch.
    const canPlay = model!.context.room.canPlay();
    if (canPlay !== this.shownCanPlay) { this.shownCanPlay = canPlay; this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.recolour(); }
  }

  private mouseWheel: Wheel | null = null;
  private mouseSlide: Slide | null = null;
  private mouseOn(w: Wheel): boolean { return this.mouseWheel === w; }

  /** Cap colours and the lights: keys held light up; a button's light shows whether it is on. */
  private recolour() {
    const m = model!.machine, canPlay = m.state().canPlay;
    this.keys.forEach((k, i) => {
      const s = k.spec;
      let c: number;
      if (s.kind === "white" || s.kind === "black") c = k.down || m.isHeld(s.note!) ? COLOR.keyDown : s.kind === "white" ? COLOR.white : COLOR.black;
      else if (s.kind === "power") c = COLOR.power;
      else if (s.kind === "memory") c = s.button!.sw === "bank" ? COLOR.bank : COLOR.memory;
      else c = COLOR.button;
      this.color.set(c);
      // What this player can't press looks it (the power key is theirs: it takes their copy out).
      if (!canPlay && s.kind !== "power") this.color.multiplyScalar(DIMMED);
      this.caps.setColor(i, this.color);
    });
    this.caps.coloursDone();
    this.color.setScalar(canPlay ? 1 : DIMMED);
    for (let i = 0; i < this.slides.length; i++) this.sliderMesh.setColorAt(i, this.color);
    for (let i = 0; i < this.wheels.length; i++) this.wheelMesh.setColorAt(i, this.color);
    LIGHTS.forEach((l, i) => this.lights.setColorAt(i, this.color.set(m.lit(l.id) ? COLOR.lightOn : COLOR.lightOff)));
    this.micRing?.color.set(m.lit("mic") ? COLOR.lightOn : COLOR.lightOff);
  }

  /** The microphone on its gooseneck (layout.ts MIC_BOOM): a socket, the neck, the head with its grille and ring. Four draw calls. */
  private buildMicBoom() {
    const x0 = micBoomX(), z0 = -BODY.depth / 2;
    const points = MIC_BOOM.neck.map(([dx, y, dz]) => new Vector3(x0 + dx, y, z0 + dz));
    const metal = this.own(new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.35, metalness: 0.8 }));
    const socket = new Mesh(this.own(new CylinderGeometry(MIC_BOOM.socket.r * 0.8, MIC_BOOM.socket.r, MIC_BOOM.socket.h, 20)), metal);
    socket.position.set(x0, MIC_BOOM.socket.h / 2, z0 + 0.006);
    this.root.add(socket);
    const curve = new CatmullRomCurve3(points);
    const neck = new Mesh(this.own(new TubeGeometry(curve, 40, MIC_BOOM.neckR, 8, false)), metal);
    this.root.add(neck);
    // The head along the neck's end, its grille towards the player.
    const end = points[points.length - 1], dir = curve.getTangent(1).normalize();
    const head = new Group();
    head.position.copy(end);
    head.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    this.root.add(head);
    const H = MIC_BOOM.head;
    const body = new Mesh(this.own(new CylinderGeometry(H.r, H.r * 0.8, H.len, 20)), metal);
    body.position.y = H.len / 2;
    head.add(body);
    const grille = new Mesh(this.own(new SphereGeometry(H.grilleR, 20, 14)), this.own(new MeshStandardMaterial({ color: 0x15171b, roughness: 0.95, metalness: 0.1 })));
    grille.position.y = H.len + H.grilleR * 0.45;
    grille.scale.set(1, 0.85, 1);
    head.add(grille);
    this.micRing = this.own(new MeshBasicMaterial({ color: COLOR.lightOff }));
    const ring = new Mesh(this.own(new TorusGeometry(H.r * 1.02, 0.0016, 8, 28)), this.micRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = H.len * 0.92;
    head.add(ring);
  }

  // ------------------------------------------------------------------ where it is

  show(anchor: Object3D | null) {
    const from = anchor ?? this.world.camera;
    from.updateWorldMatrix(true, false);
    const eye = from.getWorldPosition(new Vector3());
    const ahead = new Vector3(0, 0, -1).transformDirection(from.matrixWorld).setY(0);
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
    const xr = (this.world as unknown as { renderer?: { xr?: { isPresenting: boolean } } }).renderer?.xr?.isPresenting;
    const place = xr ? PLACE_XR : PLACE_SCREEN;
    const at = eye.clone().addScaledVector(ahead.normalize(), place.ahead);
    at.y -= place.below;
    const parent = this.root.parent;
    this.root.position.copy(parent ? parent.worldToLocal(at.clone()) : at);
    this.root.rotation.set(place.tilt, Math.atan2(eye.x - at.x, eye.z - at.z), 0, "YXZ");
    this.fitPressesToTilt();
  }

  /**
   * Each key's cap height and firing depth, in world metres along the key's own press axis (the
   * engine measures a press into the key's face, at any tilt: only our scale goes in).
   */
  private fitPressesToTilt() {
    this.root.updateMatrixWorld(true);
    for (const k of this.keys) {
      k.meta.capTopOffset = k.spec.h * SCALE;
      k.meta.pressThreshold = (k.spec.note !== undefined ? PRESS_AT_M : BUTTON_PRESS_AT_M) * SCALE;
    }
  }

  placement(): Matrix4 {
    this.root.updateWorldMatrix(true, false);
    return this.root.matrixWorld.clone();
  }

  setPlacement(placement: Matrix4) {
    const parent = this.root.parent;
    const local = parent ? new Matrix4().copy(parent.matrixWorld).invert().multiply(placement) : placement.clone();
    const scale = new Vector3();
    local.decompose(this.root.position, this.root.quaternion, scale);
    // Its size too: two hands scale it (the engine's two-hand carry, which keeps it within 0.5 to
    // 2.5 times the size it is made at); anything outside that isn't a size of ours, so it's left.
    if (scale.x > SCALE * 0.45 && scale.x < SCALE * 2.55) this.root.scale.setScalar(scale.x);
    this.fitPressesToTilt();
  }

  moveBy(move: Matrix4) {
    this.setPlacement(move.clone().multiply(this.placement()));
  }

  destroy() {
    for (const k of this.keys) this.lift(k); // nothing left sounding
    this.unsubscribe?.();
    this.stopFollowingXr?.();
    for (const key of this.grabKeys) this.grab?.unregisterButton(key);
    for (const key of this.controlKeys) this.grab?.unregisterControl(key);
    this.grabKeys = [];
    this.controlKeys = [];
    this.root.removeFromParent();
    for (const thing of this.toDispose) thing.dispose();
    this.toDispose = [];
    this.caps?.dispose();
    this.sliderMesh?.dispose();
    this.lights?.dispose();
    model?.machine.setSliderMover(null);
    this.wheelMesh?.dispose();
    this.keys = [];
    this.slides = [];
    this.wheels = [];
    this.grab = null;
  }
}
