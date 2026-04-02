import { Group, Vector3 } from "three";
import { createOrbitControls } from "./controls.js";
import { createCamera, createRenderer, createScene, onResize } from "./scene.js";
import {
  createStarPoints,
  updateStarPixelRatio,
  updateStarPointSizeUniforms,
  updateStarPositionsRelative,
} from "./stars.js";
import {
  loadExoplanets,
  loadNamedStars,
  loadStarBinary,
  type ExoplanetsPayload,
  type NamedStarsPayload,
  type StarBuffers,
} from "./utils/data-loader.js";
import {
  createStarLabelBillboards,
  selectPopularNamedStars,
} from "./star-labels.js";
import {
  createPlanetSystem,
  FALLBACK_SOL_PLANET_DEFS,
  type PlanetDef,
} from "./planets.js";
import { createInfoPanel } from "./ui/info-panel.js";
import { createLoadingOverlay } from "./ui/loading.js";

const DATA_BIN = `${import.meta.env.BASE_URL}data/stars.bin`;
const DATA_NAMES = `${import.meta.env.BASE_URL}data/named-stars.json`;
const DATA_EXOPLANETS = `${import.meta.env.BASE_URL}data/exoplanets.json`;

function planetDefsForStar(
  exo: ExoplanetsPayload | null,
  starName: string,
): PlanetDef[] {
  const list = exo?.byName[starName];
  if (list && list.length > 0) return list;
  if (starName === "Sol") return FALLBACK_SOL_PLANET_DEFS;
  return [];
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app missing");

  const loading = createLoadingOverlay();
  app.appendChild(loading.root);

  const scene = createScene();
  const camera = createCamera(app);
  const renderer = createRenderer(app);
  const controls = createOrbitControls(camera, renderer.domElement);

  const originCatalog = new Vector3(0, 0, 0);
  const originGroup = new Group();
  scene.add(originGroup);

  let popularLabelGroup: Group | null = null;

  let exoplanetsPayload: ExoplanetsPayload | null = null;

  let starData: StarBuffers;
  let named: NamedStarsPayload;
  try {
    starData = await loadStarBinary(DATA_BIN, loading.setProgress);
    named = await loadNamedStars(DATA_NAMES);
    exoplanetsPayload = await loadExoplanets(DATA_EXOPLANETS);
  } catch (e) {
    loading.remove();
    const err = document.createElement("div");
    err.style.cssText = `
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: #0a0c12; color: #f0a0a0; font-family: system-ui; padding: 2rem; text-align: center;
    `;
    err.innerHTML = `
      <div>
        <p style="font-size:1.1rem;margin-bottom:0.75rem">Could not load star data.</p>
        <p style="opacity:0.85;font-size:0.9rem;max-width:36rem">
          Run <code style="background:#1a2030;padding:2px 8px;border-radius:4px">npm run prepare-data</code>
          to download AT-HYG and generate <code>public/data/stars.bin</code>.
        </p>
        <pre style="margin-top:1rem;font-size:12px;opacity:0.7">${String(e)}</pre>
      </div>
    `;
    app.appendChild(err);
    return;
  }

  loading.remove();

  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const { points, material } = createStarPoints(starData, pixelRatio);
  updateStarPointSizeUniforms(material, camera, renderer);
  originGroup.add(points);

  const solInCatalog = named.named.find((s) => s.name === "Sol");
  const solPos = solInCatalog ?? { x: 0, y: 0, z: 0 };

  // Center the initial view on Sol's actual catalog position (may differ
  // slightly from the coordinate origin due to catalog precision).
  if (solPos.x !== 0 || solPos.y !== 0 || solPos.z !== 0) {
    originCatalog.set(solPos.x, solPos.y, solPos.z);
    originGroup.position.set(-solPos.x, -solPos.y, -solPos.z);
    camera.position.x -= solPos.x;
    camera.position.y -= solPos.y;
    camera.position.z -= solPos.z;
    controls.target.set(0, 0, 0);
    controls.update();
  }

  const planetSystem = createPlanetSystem(
    originCatalog,
    solPos,
    planetDefsForStar(exoplanetsPayload, "Sol"),
    "Sol",
  );
  originGroup.add(planetSystem.group);

  const info = createInfoPanel(camera, app, {
    getOriginCatalog: () => originCatalog,
    onOriginSet: (x, y, z, starName) => {
      const dx = x - originCatalog.x;
      const dy = y - originCatalog.y;
      const dz = z - originCatalog.z;
      originCatalog.set(x, y, z);
      originGroup.position.set(-x, -y, -z);
      camera.position.x -= dx;
      camera.position.y -= dy;
      camera.position.z -= dz;
      controls.target.set(0, 0, 0);
      controls.update();
      planetSystem.setHost(
        { x, y, z },
        planetDefsForStar(exoplanetsPayload, starName),
        starName,
      );
    },
    onPopularLabelsChange: (visible) => {
      if (popularLabelGroup) popularLabelGroup.visible = visible;
    },
  });
  info.setStarCount(starData.count);
  info.setNamedData(named);

  const popularStars = selectPopularNamedStars(named.named);
  const { group: labelBillboards } = createStarLabelBillboards(popularStars);
  labelBillboards.visible = false;
  popularLabelGroup = labelBillboards;
  originGroup.add(labelBillboards);

  window.addEventListener("resize", () => {
    onResize(app, camera, renderer);
    updateStarPixelRatio(material, Math.min(window.devicePixelRatio, 2));
    updateStarPointSizeUniforms(material, camera, renderer);
  });

  function onPointerPick(clientX: number, clientY: number): void {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    info.pickNamedStar(x, y, rect.width, rect.height);
  }

  renderer.domElement.addEventListener("click", (ev) => {
    onPointerPick(ev.clientX, ev.clientY);
  });

  renderer.domElement.style.touchAction = "none";

  function animate(): void {
    requestAnimationFrame(animate);

    controls.update();

    // Rewrite the star position buffer so every vertex is relative to the
    // camera's catalog position.  JS does the subtraction in float64,
    // so stars hundreds of parsecs from the origin stay rock-steady.
    updateStarPositionsRelative(
      points,
      starData.positions,
      starData.count,
      originCatalog.x + camera.position.x,
      originCatalog.y + camera.position.y,
      originCatalog.z + camera.position.z,
    );

    updateStarPointSizeUniforms(material, camera, renderer);
    planetSystem.update(camera);
    info.tick();

    // Shift the scene so the camera renders from the world origin.
    // This keeps modelViewMatrix translations small for Three.js objects
    // (labels, planets) whose matrices are computed in CPU float64.
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    originGroup.position.x -= cx;
    originGroup.position.y -= cy;
    originGroup.position.z -= cz;
    camera.position.set(0, 0, 0);

    renderer.render(scene, camera);

    camera.position.set(cx, cy, cz);
    originGroup.position.x += cx;
    originGroup.position.y += cy;
    originGroup.position.z += cz;
  }

  animate();
}

main().catch((e) => {
  console.error(e);
});
