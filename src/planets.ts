import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  type PerspectiveCamera,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

const AU_TO_PC = 4.84814e-6;
const ORBIT_SEGMENTS = 128;

/** Camera distance to host (pc) below which planets are fully opaque. */
const FULL_VIS_DIST = 0.002;
/** Camera distance to host (pc) above which planets are hidden. */
const FADE_OUT_DIST = 0.008;

const DOT_SCALE = 0.008;
const LABEL_SCALE = 0.024;
const GOLDEN_ANGLE = 2.39996322972865332;

export interface PlanetDef {
  name: string;
  semiMajorAxisAU: number;
  color: string;
  /** Optional fixed angle on the orbit ring (radians). */
  displayAngle?: number;
}

/** Used when exoplanets.json is missing (e.g. dev without prepare-exoplanets). */
export const FALLBACK_SOL_PLANET_DEFS: PlanetDef[] = [
  { name: "Mercury", semiMajorAxisAU: 0.387, color: "#b0b0b0" },
  { name: "Venus", semiMajorAxisAU: 0.723, color: "#e8c868" },
  { name: "Earth", semiMajorAxisAU: 1.0, color: "#5599dd" },
  { name: "Mars", semiMajorAxisAU: 1.524, color: "#cc5533" },
  { name: "Jupiter", semiMajorAxisAU: 5.203, color: "#c8a050" },
  { name: "Saturn", semiMajorAxisAU: 9.537, color: "#d8c078" },
  { name: "Uranus", semiMajorAxisAU: 19.191, color: "#88ccdd" },
  { name: "Neptune", semiMajorAxisAU: 30.069, color: "#4466cc" },
];

function phaseOffsetForStar(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ((h % 1000) / 1000) * Math.PI * 2;
}

function makeOrbit(
  radiusPC: number,
  color: string,
): { line: Line; mat: LineBasicMaterial } {
  const n = ORBIT_SEGMENTS + 1;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / ORBIT_SEGMENTS) * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * radiusPC;
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = Math.sin(a) * radiusPC;
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(pos, 3));
  const mat = new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity: 0.3,
    depthTest: false,
    depthWrite: false,
  });
  const line = new Line(geom, mat);
  line.renderOrder = 5;
  return { line, mat };
}

function makeDot(color: string): { sprite: Sprite; mat: SpriteMaterial } {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.5, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new Sprite(mat);
  sprite.scale.set(DOT_SCALE, DOT_SCALE, 1);
  sprite.renderOrder = 8;
  return { sprite, mat };
}

function makeLabel(text: string): { sprite: Sprite; mat: SpriteMaterial } {
  const pad = 3;
  const fontPx = 10;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const dpr = Math.min(
    2,
    typeof window !== "undefined" ? window.devicePixelRatio : 1,
  );
  ctx.font = `500 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + pad * 2;
  const h = fontPx + pad * 2;
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(8,10,18,0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d0d8e8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const aspect = w / h;
  const mat = new SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new Sprite(mat);
  sprite.scale.set(LABEL_SCALE * aspect, LABEL_SCALE, 1);
  sprite.renderOrder = 11;
  return { sprite, mat };
}

/**
 * Orbits and labels for known planets around a host star at `hostCatalogPos`.
 * Visibility fades with camera distance to the host (catalog space), independent
 * of which star is the view origin.
 */
export function createPlanetSystem(
  originCatalog: Vector3,
  hostCatalogPos: { x: number; y: number; z: number },
  planetDefs: PlanetDef[],
  orbitPhaseKey: string,
): {
  group: Group;
  update: (camera: PerspectiveCamera) => void;
  setHost: (
    catalogPos: { x: number; y: number; z: number },
    defs: PlanetDef[],
    phaseKey: string,
  ) => void;
} {
  const group = new Group();
  group.name = "PlanetSystem";
  group.frustumCulled = false;

  let hostPos = { ...hostCatalogPos };
  let defs = planetDefs;
  let phaseKey = orbitPhaseKey;

  const orbitMats: LineBasicMaterial[] = [];
  const dotMats: SpriteMaterial[] = [];
  const labelMats: SpriteMaterial[] = [];

  function clearVisuals(): void {
    while (group.children.length > 0) {
      const c = group.children[0]!;
      group.remove(c);
      if (c instanceof Line) {
        c.geometry.dispose();
        (c.material as LineBasicMaterial).dispose();
      } else if (c instanceof Sprite) {
        const mat = c.material as SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    }
    orbitMats.length = 0;
    dotMats.length = 0;
    labelMats.length = 0;
  }

  function rebuild(): void {
    clearVisuals();
    group.position.set(hostPos.x, hostPos.y, hostPos.z);

    if (defs.length === 0) {
      group.visible = false;
      return;
    }

    const basePhase = phaseOffsetForStar(phaseKey);
    const n = defs.length;

    for (let i = 0; i < n; i++) {
      const p = defs[i]!;
      const r = p.semiMajorAxisAU * AU_TO_PC;
      const ang =
        p.displayAngle ??
        basePhase + (i * GOLDEN_ANGLE) % (Math.PI * 2);
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;

      const { line, mat: oMat } = makeOrbit(r, p.color);
      orbitMats.push(oMat);
      group.add(line);

      const { sprite: dot, mat: dMat } = makeDot(p.color);
      dot.position.set(px, 0, pz);
      dotMats.push(dMat);
      group.add(dot);

      const { sprite: label, mat: lMat } = makeLabel(p.name);
      label.position.set(px, 0, pz);
      label.center.set(0.5, -1.0);
      labelMats.push(lMat);
      group.add(label);
    }
  }

  rebuild();

  function update(camera: PerspectiveCamera): void {
    const dx = camera.position.x + originCatalog.x - hostPos.x;
    const dy = camera.position.y + originCatalog.y - hostPos.y;
    const dz = camera.position.z + originCatalog.z - hostPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (defs.length === 0 || dist > FADE_OUT_DIST) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const t =
      dist < FULL_VIS_DIST
        ? 1.0
        : 1.0 - (dist - FULL_VIS_DIST) / (FADE_OUT_DIST - FULL_VIS_DIST);

    for (const om of orbitMats) om.opacity = t * 0.3;
    for (const dm of dotMats) dm.opacity = t;
    for (const lm of labelMats) lm.opacity = t;
  }

  function setHost(
    catalogPos: { x: number; y: number; z: number },
    newDefs: PlanetDef[],
    newPhaseKey: string,
  ): void {
    hostPos = { ...catalogPos };
    defs = newDefs;
    phaseKey = newPhaseKey;
    rebuild();
  }

  return { group, update, setHost };
}
