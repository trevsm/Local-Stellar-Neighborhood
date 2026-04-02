import type { PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createOrbitControls(
  camera: PerspectiveCamera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  // World units are parsecs. Visual star radius is ~1e-6 pc; stop outside
  // so the star fills much of the screen at closest zoom without the camera
  // passing through the disc.
  controls.minDistance = 3e-6;
  controls.maxDistance = 5e8;
  controls.rotateSpeed = 0.35;
  // Faster dolly so you can reach “inside the Solar System” zoom in reasonable time
  controls.zoomSpeed = 2.2;
  controls.target.set(0, 0, 0);
  controls.update();
  return controls;
}
