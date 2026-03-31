import {
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

export function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(new Color(0x000000), 1);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createCamera(container: HTMLElement): PerspectiveCamera {
  const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
  // Near plane in parsecs — small enough to dolly right up to Sol at origin without clipping
  const camera = new PerspectiveCamera(60, aspect, 1e-6, 1e9);
  camera.position.set(0, 80, 400);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function createScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x000000);
  return scene;
}

export function onResize(
  container: HTMLElement,
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
): void {
  const w = container.clientWidth;
  const h = Math.max(container.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
