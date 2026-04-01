import type { PerspectiveCamera, WebGLRenderer } from "three";
import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { MAG_BRIGHT, MAG_LIMIT } from "./stars.js";
import { estimateSolPointSizePixels } from "./utils/solZoom.js";

/** Matches `discR` in `star.frag.glsl` (photosphere edge in gl_PointCoord space). */
const DISC_R = 0.2;

/**
 * Opaque sphere at Sol (origin) drawn after the additive star points. Fills the resolved
 * photosphere disc so background stars cannot add through the center (additive + no depth).
 */
export function createSolOpaqueDisc(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
): { mesh: Mesh; update: () => void } {
  const geom = new SphereGeometry(1, 64, 32);
  const mat = new MeshBasicMaterial({
    color: 0xffffff,
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new Mesh(geom, mat);
  mesh.renderOrder = 1;

  function update(): void {
    const pr = Math.min(window.devicePixelRatio, 2);
    const dist = camera.position.length();
    const pt = estimateSolPointSizePixels(dist, pr, MAG_BRIGHT, MAG_LIMIT);

    // Same transition as fragment shader: resolved disc only when sprites are large
    if (pt < 40) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const h = Math.max(renderer.domElement.height, 1);
    // Disc radius in pixels (sprite half-extent is 0.5 in gl_PointCoord; disc edge at r = DISC_R)
    const discRpx = DISC_R * pt;
    const worldRadius = ((discRpx / h) * 2 * dist * tanHalf);
    mesh.scale.setScalar(worldRadius);
  }

  return { mesh, update };
}
