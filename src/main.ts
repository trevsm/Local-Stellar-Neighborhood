import { Group, Vector3 } from "three";
import { createOrbitControls } from "./controls.js";
import { createCamera, createRenderer, createScene, onResize } from "./scene.js";
import { createStarPoints, MAG_BRIGHT, MAG_LIMIT, updateStarPixelRatio } from "./stars.js";
import { loadNamedStars, loadStarBinary } from "./utils/data-loader.js";
import { minDistanceBeforeSolOverfillsViewport } from "./utils/solZoom.js";
import { createSolOpaqueDisc } from "./sol-disc.js";
import { createInfoPanel } from "./ui/info-panel.js";
import { createLoadingOverlay } from "./ui/loading.js";

const DATA_BIN = `${import.meta.env.BASE_URL}data/stars.bin`;
const DATA_NAMES = `${import.meta.env.BASE_URL}data/named-stars.json`;

/** Stop zooming in once Sol’s sprite reaches this fraction of the shorter viewport side */
const SOL_SCREEN_FILL = 0.92;

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

  const info = createInfoPanel(camera, app, {
    getOriginCatalog: () => originCatalog,
    onOriginSet: (x, y, z) => {
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
    },
  });

  let starData;
  try {
    starData = await loadStarBinary(DATA_BIN, loading.setProgress);
    const named = await loadNamedStars(DATA_NAMES);
    info.setStarCount(starData.count);
    info.setNamedData(named);
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
  originGroup.add(points);

  const solDisc = createSolOpaqueDisc(camera, renderer);
  originGroup.add(solDisc.mesh);

  window.addEventListener("resize", () => {
    onResize(app, camera, renderer);
    updateStarPixelRatio(material, Math.min(window.devicePixelRatio, 2));
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

    const pr = Math.min(window.devicePixelRatio, 2);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;

    // Orbit target at Sol: cap zoom so the Sun sprite cannot grow past ~full screen
    if (controls.target.lengthSq() < 1e-12) {
      controls.minDistance = minDistanceBeforeSolOverfillsViewport(
        w,
        h,
        pr,
        MAG_BRIGHT,
        MAG_LIMIT,
        SOL_SCREEN_FILL,
      );
    } else {
      controls.minDistance = 0;
    }

    controls.update();
    solDisc.update();
    info.tick();
    renderer.render(scene, camera);
  }

  animate();
}

main().catch((e) => {
  console.error(e);
});
