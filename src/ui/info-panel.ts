import type { PerspectiveCamera } from "three";
import type { NamedStarsPayload } from "../utils/data-loader.js";
import { Vector3 } from "three";
import { distanceRayToPoint } from "../stars.js";

export function createInfoPanel(
  camera: PerspectiveCamera,
  container: HTMLElement,
): {
  root: HTMLDivElement;
  setStarCount: (n: number) => void;
  setNamedData: (data: NamedStarsPayload) => void;
  tick: () => void;
  pickNamedStar: (
    ndcX: number,
    ndcY: number,
    width: number,
    height: number,
  ) => void;
  clearPick: () => void;
} {
  const root = document.createElement("div");
  root.style.cssText = `
    position: fixed;
    left: 12px;
    top: 12px;
    max-width: min(420px, 92vw);
    padding: 12px 14px;
    border-radius: 8px;
    background: rgba(8, 10, 18, 0.82);
    border: 1px solid rgba(120, 140, 180, 0.25);
    color: #d8e0f0;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    z-index: 50;
    pointer-events: none;
    user-select: none;
  `;

  const title = document.createElement("div");
  title.textContent = "AT-HYG v3.3 — local stellar neighborhood";
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  title.style.letterSpacing = "0.02em";

  const starsLine = document.createElement("div");
  starsLine.textContent = "Stars: …";

  const distLine = document.createElement("div");
  distLine.style.marginTop = "4px";
  distLine.textContent = "Camera distance from Sol: …";

  const hint = document.createElement("div");
  hint.style.marginTop = "8px";
  hint.style.fontSize = "11px";
  hint.style.opacity = "0.7";
  hint.textContent =
    "Drag to orbit · Scroll to zoom · Click to identify named stars";

  const pickBox = document.createElement("div");
  pickBox.style.marginTop = "10px";
  pickBox.style.paddingTop = "8px";
  pickBox.style.borderTop = "1px solid rgba(120,140,180,0.2)";
  pickBox.style.display = "none";
  pickBox.style.whiteSpace = "pre-wrap";

  root.appendChild(title);
  root.appendChild(starsLine);
  root.appendChild(distLine);
  root.appendChild(hint);
  root.appendChild(pickBox);

  container.appendChild(root);

  let namedPayload: NamedStarsPayload | null = null;
  const rayOrigin = new Vector3();
  const rayDir = new Vector3();
  const starPos = new Vector3();

  function setStarCount(n: number): void {
    starsLine.textContent = `Stars: ${n.toLocaleString()}`;
  }

  function setNamedData(data: NamedStarsPayload): void {
    namedPayload = data;
  }

  function tick(): void {
    const d = camera.position.length();
    if (d >= 1e6) {
      distLine.textContent = `Camera distance from Sol: ${(d / 1e6).toFixed(2)} Mpc`;
    } else if (d >= 1e3) {
      distLine.textContent = `Camera distance from Sol: ${(d / 1e3).toFixed(2)} kpc`;
    } else {
      distLine.textContent = `Camera distance from Sol: ${d.toFixed(1)} pc`;
    }
  }

  function clearPick(): void {
    pickBox.style.display = "none";
    pickBox.textContent = "";
  }

  function pickNamedStar(
    canvasX: number,
    canvasY: number,
    width: number,
    height: number,
  ): void {
    if (!namedPayload?.named.length) return;

    const ndcX = (canvasX / width) * 2 - 1;
    const ndcY = -(canvasY / height) * 2 + 1;
    camera.updateMatrixWorld(true);
    rayOrigin.setFromMatrixPosition(camera.matrixWorld);
    const v = new Vector3(ndcX, ndcY, 0.5);
    v.unproject(camera);
    rayDir.copy(v).sub(rayOrigin).normalize();

    let best: (typeof namedPayload.named)[0] | null = null;
    let bestDist = Infinity;
    const threshold = Math.max(12, camera.position.length() * 0.002);

    for (const s of namedPayload.named) {
      starPos.set(s.x, s.y, s.z);
      const dist = distanceRayToPoint(rayOrigin, rayDir, starPos);
      if (dist < bestDist && dist < threshold) {
        bestDist = dist;
        best = s;
      }
    }

    if (best) {
      pickBox.style.display = "block";
      const spect = best.spect ? `\nSpectral type: ${best.spect}` : "";
      pickBox.textContent = `${best.name}\nV magnitude: ${best.mag.toFixed(2)}\nDistance: ${best.dist.toFixed(2)} pc${spect}`;
    } else {
      clearPick();
    }
  }

  return {
    root,
    setStarCount,
    setNamedData,
    tick,
    pickNamedStar,
    clearPick,
  };
}
