/**
 * Years of use, drawn once into small canvases: grime settled at the edges of the key caps, fine
 * scratches, a finger-polished shine in the middle of each cap; on the faceplate, scuffs, grease
 * round the keys, rubbed-off printing and dirt towards the edges. Seeded, so the machine looks
 * the same every time it loads.
 *
 * The caps' textures go into the engine's shared instance pools (one material per cap shape, for
 * every copy of the module), so the keys of one shape share their wear pattern.
 */

/** A small seeded random (mulberry32): the same wear on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvasOf = (size: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
};

/**
 * The caps' colour wear (multiplied into each key's colour, so near-white): mottling, scratches
 * and grime.
 */
export function capWearMap(): HTMLCanvasElement {
  const size = 256, rand = seeded(707);
  const [c, g] = canvasOf(size);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  // Mottled plastic.
  for (let i = 0; i < 2600; i++) {
    const v = 214 + Math.floor(rand() * 41);
    g.fillStyle = `rgba(${v}, ${v - 4}, ${v - 12}, ${0.18 + rand() * 0.25})`;
    const r = 1 + rand() * 3;
    g.fillRect(rand() * size, rand() * size, r, r);
  }
  // Grime: soft brown patches, heavier in some places than others.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, r = 10 + rand() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(96, 80, 58, ${0.05 + rand() * 0.09})`);
    grad.addColorStop(1, "rgba(96, 80, 58, 0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fine scratches.
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const x = rand() * size, y = rand() * size, len = 6 + rand() * 30, a = rand() * Math.PI;
    g.strokeStyle = rand() < 0.6 ? `rgba(70, 64, 56, ${0.12 + rand() * 0.2})` : `rgba(255, 255, 255, ${0.25 + rand() * 0.3})`;
    g.lineWidth = 0.5 + rand() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/**
 * The caps' roughness (green channel): satin plastic, rubbed smooth and shiny in the middle where
 * fingers land, and dirtier (rougher) towards the edges. Not shifted per key: every face's middle
 * is the middle.
 */
export function capRoughnessMap(): HTMLCanvasElement {
  const size = 128, rand = seeded(1707);
  const [c, g] = canvasOf(size);
  g.fillStyle = "rgb(170, 170, 170)"; // about 0.67
  g.fillRect(0, 0, size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size * 0.42);
  grad.addColorStop(0, "rgb(70, 70, 70)"); // about 0.27: finger-polished
  grad.addColorStop(0.65, "rgb(125, 125, 125)");
  grad.addColorStop(1, "rgba(170, 170, 170, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    const v = 120 + Math.floor(rand() * 90);
    g.fillStyle = `rgba(${v}, ${v}, ${v}, 0.35)`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Edges: grime makes them dull.
  g.strokeStyle = "rgba(205, 205, 205, 0.8)";
  g.lineWidth = 10;
  g.strokeRect(0, 0, size, size);
  return c;
}


/** Wear on the faceplate, drawn over the print. `keys` are the key rectangles in canvas pixels. */
export function wearFaceplate(g: CanvasRenderingContext2D, w: number, h: number, keys: { x: number; y: number; w: number; h: number; use: number }[], background: (x: number, y: number) => string): void {
  const rand = seeded(1983);
  // Grease and dirt round the keys, most round the ones used most.
  for (const k of keys) {
    const cx = k.x + k.w / 2, cy = k.y + k.h / 2, r = Math.max(k.w, k.h) * (0.75 + k.use * 0.5);
    const grad = g.createRadialGradient(cx, cy, Math.min(k.w, k.h) * 0.4, cx, cy, r);
    grad.addColorStop(0, `rgba(40, 30, 18, ${0.12 + k.use * 0.16})`);
    grad.addColorStop(1, "rgba(40, 30, 18, 0)");
    g.fillStyle = grad;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // Printing rubbed away in places: specks of the background over everything (shows on the print).
  for (let i = 0; i < 9000; i++) {
    const x = rand() * w, y = rand() * h;
    g.fillStyle = background(x, y);
    g.globalAlpha = 0.25 + rand() * 0.5;
    const r = 0.8 + rand() * 2.2;
    g.fillRect(x, y, r, r);
  }
  g.globalAlpha = 1;
  // Scuffs and scratches.
  g.lineCap = "round";
  for (let i = 0; i < 140; i++) {
    const x = rand() * w, y = rand() * h, len = 10 + rand() * 90, a = rand() * Math.PI * 2;
    g.strokeStyle = rand() < 0.7 ? `rgba(255, 255, 255, ${0.04 + rand() * 0.1})` : `rgba(0, 0, 0, ${0.08 + rand() * 0.12})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 12, y + Math.sin(a) * len * 0.5 + (rand() - 0.5) * 12, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // Dust and dirt gathered towards the edges and corners.
  const vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
  vignette.addColorStop(0, "rgba(30, 24, 16, 0)");
  vignette.addColorStop(1, "rgba(30, 24, 16, 0.32)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, w, h);
}
