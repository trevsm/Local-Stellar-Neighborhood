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

/** Camera distance to Sol (pc) below which planets are fully opaque. */
const FULL_VIS_DIST = 0.002;
/** Camera distance to Sol (pc) above which planets are hidden. */
const FADE_OUT_DIST = 0.008;

const DOT_SCALE = 0.008;
const LABEL_SCALE = 0.024;
/** Label offset as a fraction of camera-to-planet distance — keeps text ~fixed pixels above the dot. */
const LABEL_OFFSET_SCREEN_SCALE = 0.022;

interface PlanetDef {
  name: string;
  semiMajorAxisAU: number;
  color: string;
  displayAngle: number;
}

const SOL_PLANETS: PlanetDef[] = [
  { name: "Mercury", semiMajorAxisAU: 0.387,  color: "#b0b0b0", displayAngle: 0.0  },
  { name: "Venus",   semiMajorAxisAU: 0.723,  color: "#e8c868", displayAngle: 2.40 },
  { name: "Earth",   semiMajorAxisAU: 1.000,  color: "#5599dd", displayAngle: 4.80 },
  { name: "Mars",    semiMajorAxisAU: 1.524,  color: "#cc5533", displayAngle: 0.92 },
  { name: "Jupiter", semiMajorAxisAU: 5.203,  color: "#c8a050", displayAngle: 3.32 },
  { name: "Saturn",  semiMajorAxisAU: 9.537,  color: "#d8c078", displayAngle: 5.72 },
  { name: "Uranus",  semiMajorAxisAU: 19.191, color: "#88ccdd", displayAngle: 1.83 },
  { name: "Neptune", semiMajorAxisAU: 30.069, color: "#4466cc", displayAngle: 4.23 },
];

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
 * Orbit rings, planet markers, and labels for the eight Solar System planets
 * around Sol.
 *
 * Planets fade in as the camera approaches Sol and are hidden when far away so
 * they don't clutter the interstellar view.
 *
 * @param originCatalog Live reference — updated when the user picks a new
 *   origin star — so we can compute camera-to-Sol distance each frame.
 * @param solCatalogPos Sol's actual position in the catalog (may not be exact
 *   zero due to catalog precision).
 */
export function createSolPlanets(
  originCatalog: Vector3,
  solCatalogPos: { x: number; y: number; z: number },
): {
  group: Group;
  update: (camera: PerspectiveCamera) => void;
} {
  const group = new Group();
  group.name = "SolPlanets";
  group.frustumCulled = false;
  group.position.set(solCatalogPos.x, solCatalogPos.y, solCatalogPos.z);

  const orbitMats: LineBasicMaterial[] = [];
  const dotMats: SpriteMaterial[] = [];
  const labelMats: SpriteMaterial[] = [];
  const planetPairs: { dot: Sprite; label: Sprite }[] = [];

  const worldDot = new Vector3();
  const worldLabel = new Vector3();
  const screenUp = new Vector3();

  for (const p of SOL_PLANETS) {
    const r = p.semiMajorAxisAU * AU_TO_PC;
    const px = Math.cos(p.displayAngle) * r;
    const pz = Math.sin(p.displayAngle) * r;

    const { line, mat: oMat } = makeOrbit(r, p.color);
    orbitMats.push(oMat);
    group.add(line);

    const { sprite: dot, mat: dMat } = makeDot(p.color);
    dot.position.set(px, 0, pz);
    dotMats.push(dMat);
    group.add(dot);

    const { sprite: label, mat: lMat } = makeLabel(p.name);
    label.position.set(px, 0, pz);
    labelMats.push(lMat);
    group.add(label);
    planetPairs.push({ dot, label });
  }

  function update(camera: PerspectiveCamera): void {
    // Sol is at solCatalogPos in catalog space. In world space that maps to
    // solCatalogPos - originCatalog (because originGroup.position = -originCatalog).
    const dx = camera.position.x + originCatalog.x - solCatalogPos.x;
    const dy = camera.position.y + originCatalog.y - solCatalogPos.y;
    const dz = camera.position.z + originCatalog.z - solCatalogPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > FADE_OUT_DIST) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const m = camera.matrixWorld.elements;
    for (const { dot, label } of planetPairs) {
      dot.getWorldPosition(worldDot);
      const camDist = camera.position.distanceTo(worldDot);
      const off = LABEL_OFFSET_SCREEN_SCALE * camDist;
      screenUp.set(m[4], m[5], m[6]).normalize();
      worldLabel.copy(worldDot).add(screenUp.multiplyScalar(off));
      group.worldToLocal(label.position.copy(worldLabel));
    }

    const t =
      dist < FULL_VIS_DIST
        ? 1.0
        : 1.0 - (dist - FULL_VIS_DIST) / (FADE_OUT_DIST - FULL_VIS_DIST);

    for (const m of orbitMats) m.opacity = t * 0.3;
    for (const m of dotMats) m.opacity = t;
    for (const m of labelMats) m.opacity = t;
  }

  return { group, update };
}
