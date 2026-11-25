/**
 * Repeated parts (key caps, slider caps, wheels, lights) drawn from the engine's shared instance
 * pools (`context.instancePool`): one InstancedMesh per kind of part for every copy of this
 * module, so a second machine adds no draw calls.
 *
 * Each part is a slot that follows an invisible stand-in object under the machine, so it moves
 * with the machine when it is carried. `setMatrixAt` places a part in the machine's own space (as
 * an InstancedMesh's would); `setColorAt` colours it. The pool owns the geometry and material its
 * first maker built: never dispose them here. Removing the module gives the slots back.
 *
 * A part kind can carry per-instance data its material's shader reads (`attributes`, set per part
 * with `set`) and the shader changes that read it (`shader`: plain GLSL strings the engine applies,
 * so the pool keeps nothing of this copy's code).
 *
 * A container whose engine is older than the pools (no `context.instancePool`) still gets the
 * machine: each kind of part is then an InstancedMesh of this copy's own (one draw call per kind
 * per copy, as before the pools), freed with the module.
 */
import { InstancedMesh, Object3D, type BufferGeometry, type Color, type Material, type Matrix4 } from "three";
import type { ModuleContext } from "@engine/api/module";
import type { InstancePool, InstancePoolSpec, InstanceSlot, ShaderPatches } from "@engine/api/module";

type PoolMaker = (name: string, make: () => InstancePoolSpec) => InstancePool;

export class PooledParts {
  private readonly standIns: Object3D[] = [];
  private readonly slots: InstanceSlot[] = [];
  /** Without the engine's pools: this copy's own mesh for the part. */
  private readonly own: InstancedMesh | null = null;

  /**
   * `name`: the kind of part ("slider", "light", "cap-0.022x0.006x0.012"): one pool per kind, shared
   * by every copy of this module. `make` runs only for the first copy (the pool keeps what it builds).
   */
  constructor(
    context: ModuleContext, name: string, make: () => { geometry: BufferGeometry; material: Material }, count: number, parent: Object3D,
    looks: { attributes?: Record<string, number>; shader?: ShaderPatches } = {},
  ) {
    const instancePool = (context as unknown as { instancePool?: PoolMaker }).instancePool;
    if (typeof instancePool !== "function") {
      const { geometry, material } = make();
      this.own = new InstancedMesh(geometry, material, count);
      this.own.frustumCulled = false;
      parent.add(this.own);
      return;
    }
    const pool = instancePool.call(context, name, () => ({ ...make(), capacity: count, ...looks }));
    for (let i = 0; i < count; i++) {
      const standIn = new Object3D();
      standIn.matrixAutoUpdate = false; // placed by setMatrixAt; its world matrix follows the machine
      parent.add(standIn);
      const slot = pool.take();
      slot.follow(standIn);
      this.standIns.push(standIn);
      this.slots.push(slot);
    }
  }

  /** Drawn from a shared pool (false: this copy's own mesh, an older container). */
  get pooled(): boolean { return !this.own; }

  /** Where part `i` sits, in the parent's (the machine's) space. */
  setMatrixAt(i: number, m: Matrix4): void {
    if (this.own) { this.own.setMatrixAt(i, m); this.own.instanceMatrix.needsUpdate = true; return; }
    const o = this.standIns[i];
    o.matrix.copy(m);
    o.matrixWorldNeedsUpdate = true;
  }

  setColorAt(i: number, c: Color): void {
    if (this.own) { this.own.setColorAt(i, c); if (this.own.instanceColor) this.own.instanceColor.needsUpdate = true; return; }
    this.slots[i].setColor(c);
  }

  /** Part `i`'s per-instance data (`set(i, "wear", 0.4, 0.7)`). Without the pools: nothing (the shared look). */
  set(i: number, name: string, ...values: number[]): void {
    if (!this.own) this.slots[i].set(name, ...values);
  }

  /** Give the slots back (removing the module does this too); or free this copy's own mesh. */
  dispose(): void {
    if (this.own) {
      this.own.removeFromParent();
      this.own.geometry.dispose();
      (this.own.material as Material).dispose();
      this.own.dispose();
      return;
    }
    for (const s of this.slots) s.release();
    for (const o of this.standIns) o.removeFromParent();
    this.slots.length = 0;
    this.standIns.length = 0;
  }
}
