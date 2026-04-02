import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { StarBuffers } from "./utils/data-loader.js";
import starVert from "./shaders/star.vert.glsl?raw";
import starFrag from "./shaders/star.frag.glsl?raw";

/** Apparent magnitude at which a star reaches full display brightness. */
export const MAG_BRIGHT = -2.0;
/** Apparent magnitude below which stars are invisible. */
export const MAG_LIMIT = 20.0;

const SOL_ABS_MAG = 4.83;

export function createStarPoints(
  data: StarBuffers,
  pixelRatio: number,
): { points: Points; material: ShaderMaterial } {
  const { count, positions, colors, magnitudes } = data;
  const geom = new BufferGeometry();

  const pos = new Float32Array(count * 3);
  pos.set(positions.subarray(0, count * 3));

  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    col[o] = colors[o]! / 255;
    col[o + 1] = colors[o + 1]! / 255;
    col[o + 2] = colors[o + 2]! / 255;
  }

  // Derive absolute magnitude from catalog apparent magnitude and 3D position.
  // M = m - 5·log₁₀(d_pc) + 5, with Sol handled as a special case (d = 0).
  const absMag = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const px = pos[i * 3]!;
    const py = pos[i * 3 + 1]!;
    const pz = pos[i * 3 + 2]!;
    const dist = Math.sqrt(px * px + py * py + pz * pz);

    if (dist < 1e-6) {
      absMag[i] = SOL_ABS_MAG;
    } else {
      absMag[i] = magnitudes[i]! - 5 * Math.log10(dist) + 5;
    }
  }

  geom.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geom.setAttribute("color", new Float32BufferAttribute(col, 3));
  geom.setAttribute("absMag", new Float32BufferAttribute(absMag, 1));

  const material = new ShaderMaterial({
    uniforms: {
      magBright: { value: MAG_BRIGHT },
      magLimit: { value: MAG_LIMIT },
      pixelRatio: { value: pixelRatio },
      viewportHeight: { value: 1 },
      tanHalfFov: { value: 1 },
    },
    vertexShader: starVert,
    fragmentShader: starFrag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geom, material);
  points.frustumCulled = false;
  return { points, material };
}

export function updateStarPixelRatio(
  material: ShaderMaterial,
  pixelRatio: number,
): void {
  material.uniforms.pixelRatio!.value = pixelRatio;
}

const _bufSize = new Vector2();

/**
 * Perspective-correct angular sizing needs viewport height (drawing-buffer px) and tan(fov/2).
 * Call each frame (or on resize) so star discs track zoom without hitting artificial size caps.
 */
export function updateStarPointSizeUniforms(
  material: ShaderMaterial,
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
): void {
  renderer.getDrawingBufferSize(_bufSize);
  material.uniforms.viewportHeight!.value = _bufSize.y;
  material.uniforms.tanHalfFov!.value = Math.tan((camera.fov * Math.PI) / 360);
}

/**
 * Rewrite the position buffer so every vertex is relative to `offset`
 * (the camera's catalog-space position).  JavaScript performs the
 * subtraction in float64, avoiding the catastrophic cancellation that
 * float32 GPU math would introduce for stars far from the world origin.
 *
 * Also sets `points.position` to the same offset so the model matrix
 * compensates and world-space positions remain correct.
 */
export function updateStarPositionsRelative(
  points: Points,
  originalPositions: Float32Array,
  count: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
): void {
  const posAttr = points.geometry.getAttribute("position");
  const arr = posAttr.array as Float32Array;
  const n = count * 3;
  for (let i = 0; i < n; i += 3) {
    arr[i] = originalPositions[i]! - offsetX;
    arr[i + 1] = originalPositions[i + 1]! - offsetY;
    arr[i + 2] = originalPositions[i + 2]! - offsetZ;
  }
  posAttr.needsUpdate = true;
  points.position.set(offsetX, offsetY, offsetZ);
}

/** Distance from infinite ray to point in world space */
export function distanceRayToPoint(
  rayOrigin: Vector3,
  rayDir: Vector3,
  point: Vector3,
): number {
  const toPoint = new Vector3().subVectors(point, rayOrigin);
  const t = toPoint.dot(rayDir);
  if (t < 0) {
    return rayOrigin.distanceTo(point);
  }
  const closest = new Vector3().copy(rayOrigin).addScaledVector(rayDir, t);
  return closest.distanceTo(point);
}
