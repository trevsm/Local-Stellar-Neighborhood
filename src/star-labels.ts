import {
  CanvasTexture,
  Group,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type PerspectiveCamera,
} from "three";
import type { NamedStarsPayload } from "./utils/data-loader.js";

export const POPULAR_LABEL_COUNT = 80;

/** Always labeled when present in the catalog (in addition to the brightest popular list). */
const MUST_LABEL_NAMES: readonly string[] = ["Sol", "Tau Ceti"];

type NamedEntry = NamedStarsPayload["named"][0];

/**
 * “Popular” labels: {@link MUST_LABEL_NAMES} first, then the brightest remaining named stars
 * (naked-eye range, excluding the Sun from the magnitude-sorted list). Dedupes by name.
 */
export function selectPopularNamedStars(named: NamedEntry[]): NamedEntry[] {
  const byName = new Map<string, NamedEntry>();
  for (const s of named) {
    byName.set(s.name, s);
  }

  const eligible = named.filter((s) => s.mag > -15 && s.mag < 6);
  eligible.sort((a, b) => a.mag - b.mag);

  const seen = new Set<string>();
  const out: NamedEntry[] = [];

  for (const name of MUST_LABEL_NAMES) {
    const s = byName.get(name);
    if (s && !seen.has(s.name)) {
      out.push(s);
      seen.add(s.name);
    }
  }

  for (const s of eligible) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
    if (out.length >= POPULAR_LABEL_COUNT) break;
  }

  return out;
}

/** Same canvas styling as planet name sprites (`makeLabel` in planets.ts). */
function createLabelTexture(text: string): {
  texture: CanvasTexture;
  aspect: number;
} {
  const pad = 3;
  const fontPx = 10;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
  ctx.font = `500 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const textW = ctx.measureText(text).width;
  const w = textW + pad * 2;
  const h = fontPx + pad * 2;
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(8,10,18,0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d0d8e8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, aspect: w / h };
}

/** Same as planet labels — offset above anchor in screen space. */
const LABEL_OFFSET_SCREEN_SCALE = 0.022;

/** Same as planet `LABEL_SCALE` — sprite height in world units with sizeAttenuation off. */
const LABEL_SCALE = 0.024;

/**
 * Billboard sprites (camera-facing) for star names. Add as child of the same group as points
 * so origin shifts apply. Call `dispose()` when discarding.
 */
export function createStarLabelBillboards(stars: NamedEntry[]): {
  group: Group;
  update: (camera: PerspectiveCamera) => void;
  dispose: () => void;
} {
  const group = new Group();
  group.name = "StarLabels";
  const textures: CanvasTexture[] = [];
  const materials: SpriteMaterial[] = [];
  const labelAnchors: { anchor: Vector3; sprite: Sprite }[] = [];
  const worldAnchor = new Vector3();
  const worldLabel = new Vector3();
  const screenUp = new Vector3();

  for (const s of stars) {
    const { texture, aspect } = createLabelTexture(s.name);
    textures.push(texture);
    const mat = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
    });
    materials.push(mat);
    const sprite = new Sprite(mat);
    sprite.position.set(s.x, s.y, s.z);
    sprite.renderOrder = 11;
    sprite.scale.set(LABEL_SCALE * aspect, LABEL_SCALE, 1);
    group.add(sprite);
    labelAnchors.push({
      anchor: new Vector3(s.x, s.y, s.z),
      sprite,
    });
  }

  function update(camera: PerspectiveCamera): void {
    const m = camera.matrixWorld.elements;
    screenUp.set(m[4], m[5], m[6]).normalize();

    for (const { anchor, sprite } of labelAnchors) {
      worldAnchor.copy(anchor);
      group.localToWorld(worldAnchor);
      const camDist = camera.position.distanceTo(worldAnchor);
      const off = LABEL_OFFSET_SCREEN_SCALE * camDist;
      worldLabel.copy(worldAnchor).addScaledVector(screenUp, off);
      group.worldToLocal(sprite.position.copy(worldLabel));
    }
  }

  function dispose(): void {
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  return { group, update, dispose };
}
