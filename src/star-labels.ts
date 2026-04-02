import {
  CanvasTexture,
  Group,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function createLabelTexture(text: string): {
  texture: CanvasTexture;
  aspect: number;
} {
  const pad = 4;
  const fontPx = 11;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const textW = ctx.measureText(text).width;
  const w = textW + pad * 2;
  const h = fontPx + pad * 2;
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  roundRect(ctx, 0, 0, w, h, 4);
  ctx.fillStyle = "rgba(8, 10, 18, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 140, 180, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#d8e0f0";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, aspect: w / h };
}

/**
 * World-space offset so the label sits slightly above the star (catalog parsecs).
 * Keep small: at close zoom (sub-parsec) a large offset makes labels look detached from the point.
 */
const LABEL_OFFSET_Y = 0.018;

/**
 * Sprite height scale (world units). With `sizeAttenuation: false`, this maps to
 * roughly constant screen size — values above ~0.08 read as huge; keep near 0.03–0.05.
 */
const LABEL_BASE_SCALE = 0.038;

/**
 * Billboard sprites (camera-facing) for star names. Add as child of the same group as points
 * so origin shifts apply. Call `dispose()` when discarding.
 */
export function createStarLabelBillboards(stars: NamedEntry[]): {
  group: Group;
  dispose: () => void;
} {
  const group = new Group();
  group.name = "StarLabels";
  const textures: CanvasTexture[] = [];
  const materials: SpriteMaterial[] = [];

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
    sprite.position.set(s.x, s.y + LABEL_OFFSET_Y, s.z);
    sprite.renderOrder = 10;
    sprite.scale.set(LABEL_BASE_SCALE * aspect, LABEL_BASE_SCALE, 1);
    group.add(sprite);
  }

  function dispose(): void {
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  return { group, dispose };
}
