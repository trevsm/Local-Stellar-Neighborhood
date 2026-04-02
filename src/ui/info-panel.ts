import type { PerspectiveCamera, Vector3 } from "three";
import { Vector3 as Vec3 } from "three";
import type { NamedStarsPayload } from "../utils/data-loader.js";
import { distanceRayToPoint } from "../stars.js";

type NamedEntry = NamedStarsPayload["named"][0];

const LIST_MAX = 500;

const COLLAPSE_STORAGE_KEY = "lsn-info-panel-collapsed";

/**
 * Match query against display name and optional aliases using word tokens so
 * short substrings like "tau" do not match inside "Centauri".
 */
function matchesNamedStarQuery(s: NamedEntry, q: string): boolean {
  const qn = q.trim().toLowerCase();
  if (!qn) return true;
  const words = [s.name, ...(s.aliases ?? [])]
    .join(" ")
    .toLowerCase()
    .split(/[\s\-–—]+/)
    .filter(Boolean);
  const tokens = qn.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) =>
    words.some((w) => w === t || w.startsWith(t)),
  );
}

export function createInfoPanel(
  camera: PerspectiveCamera,
  container: HTMLElement,
  options: {
    getOriginCatalog: () => Vector3;
    onOriginSet: (x: number, y: number, z: number, starName: string) => void;
    onPopularLabelsChange?: (visible: boolean) => void;
  },
): {
  root: HTMLDivElement;
  setStarCount: (n: number) => void;
  setNamedData: (data: NamedStarsPayload) => void;
  tick: () => void;
  pickNamedStar: (
    canvasX: number,
    canvasY: number,
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

  const headerRow = document.createElement("div");
  headerRow.style.cssText = `
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    pointer-events: auto;
  `;

  const title = document.createElement("div");
  title.textContent = "AT-HYG v3.3 — local stellar neighborhood";
  title.style.fontWeight = "600";
  title.style.letterSpacing = "0.02em";
  title.style.flex = "1";
  title.style.minWidth = "0";

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.textContent = "▼";
  collapseBtn.setAttribute("aria-expanded", "true");
  collapseBtn.setAttribute("aria-label", "Collapse panel");
  collapseBtn.style.cssText = `
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 6px;
    border: 1px solid rgba(120, 140, 180, 0.35);
    background: rgba(12, 16, 28, 0.95);
    color: #d8e0f0;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  `;
  collapseBtn.addEventListener("mouseenter", () => {
    collapseBtn.style.background = "rgba(40, 60, 100, 0.55)";
    collapseBtn.style.borderColor = "rgba(140, 160, 200, 0.45)";
  });
  collapseBtn.addEventListener("mouseleave", () => {
    collapseBtn.style.background = "rgba(12, 16, 28, 0.95)";
    collapseBtn.style.borderColor = "rgba(120, 140, 180, 0.35)";
  });

  headerRow.appendChild(title);
  headerRow.appendChild(collapseBtn);

  const bodyEl = document.createElement("div");
  bodyEl.style.pointerEvents = "none";

  const starsLine = document.createElement("div");
  starsLine.textContent = "Stars: …";

  const originLine = document.createElement("div");
  originLine.style.marginTop = "4px";
  originLine.textContent = "Origin: Sol";

  const distLine = document.createElement("div");
  distLine.style.marginTop = "4px";
  distLine.textContent = "Camera distance from origin: …";

  const originBox = document.createElement("div");
  originBox.style.cssText = `
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(120,140,180,0.2);
    pointer-events: auto;
    user-select: text;
  `;

  const originLabel = document.createElement("div");
  originLabel.style.fontSize = "11px";
  originLabel.style.opacity = "0.85";
  originLabel.style.marginBottom = "6px";
  originLabel.textContent =
    "Search proper & Bayer names (e.g. Tau Ceti) · click to set origin";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Filter by name…";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid rgba(120, 140, 180, 0.35);
    background: rgba(12, 16, 28, 0.95);
    color: #e8eef8;
    font: inherit;
    font-size: 12px;
    outline: none;
  `;

  const listWrap = document.createElement("div");
  listWrap.style.cssText = `
    margin-top: 8px;
    max-height: min(240px, 40vh);
    overflow: auto;
    border-radius: 6px;
    border: 1px solid rgba(120, 140, 180, 0.2);
    background: rgba(6, 8, 14, 0.6);
  `;

  const listHint = document.createElement("div");
  listHint.style.cssText = `
    padding: 6px 8px;
    font-size: 11px;
    opacity: 0.65;
    border-bottom: 1px solid rgba(120,140,180,0.15);
  `;
  listHint.textContent = "Loading…";

  const listEl = document.createElement("div");
  listEl.style.padding = "4px 0";

  listWrap.appendChild(listHint);
  listWrap.appendChild(listEl);

  originBox.appendChild(originLabel);
  originBox.appendChild(searchInput);
  originBox.appendChild(listWrap);

  if (options.onPopularLabelsChange) {
    const labelsRow = document.createElement("div");
    labelsRow.style.cssText = `
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      opacity: 0.95;
    `;
    const labelToggle = document.createElement("input");
    labelToggle.type = "checkbox";
    labelToggle.id = "popular-stars-toggle";
    labelToggle.addEventListener("change", () => {
      options.onPopularLabelsChange?.(labelToggle.checked);
    });
    const labelToggleLabel = document.createElement("label");
    labelToggleLabel.htmlFor = "popular-stars-toggle";
    labelToggleLabel.style.cursor = "pointer";
    labelToggleLabel.textContent = "Show popular stars";
    labelsRow.appendChild(labelToggle);
    labelsRow.appendChild(labelToggleLabel);
    originBox.appendChild(labelsRow);
  }

  const hint = document.createElement("div");
  hint.style.marginTop = "8px";
  hint.style.fontSize = "11px";
  hint.style.opacity = "0.7";
  hint.textContent =
    "Drag to orbit · Scroll to zoom · Click sky to identify named stars · Optional name labels · " +
      "When AT-HYG gives two stars the same xyz (common for close binaries), they are drawn slightly apart for visibility, not to true separation.";

  const pickBox = document.createElement("div");
  pickBox.style.marginTop = "10px";
  pickBox.style.paddingTop = "8px";
  pickBox.style.borderTop = "1px solid rgba(120,140,180,0.2)";
  pickBox.style.display = "none";
  pickBox.style.pointerEvents = "auto";

  const pickText = document.createElement("div");
  pickText.style.whiteSpace = "pre-wrap";

  const setOriginBtn = document.createElement("button");
  setOriginBtn.type = "button";
  setOriginBtn.textContent = "Set as origin";
  setOriginBtn.style.cssText = `
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(120, 140, 180, 0.45);
    background: rgba(40, 70, 130, 0.45);
    color: #e8eef8;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
  `;
  setOriginBtn.addEventListener("mouseenter", () => {
    setOriginBtn.style.background = "rgba(60, 100, 180, 0.55)";
  });
  setOriginBtn.addEventListener("mouseleave", () => {
    setOriginBtn.style.background = "rgba(40, 70, 130, 0.45)";
  });

  pickBox.appendChild(pickText);
  pickBox.appendChild(setOriginBtn);

  bodyEl.appendChild(starsLine);
  bodyEl.appendChild(originLine);
  bodyEl.appendChild(distLine);
  bodyEl.appendChild(originBox);
  bodyEl.appendChild(hint);
  bodyEl.appendChild(pickBox);

  root.appendChild(headerRow);
  root.appendChild(bodyEl);

  let panelCollapsed = false;
  try {
    panelCollapsed = localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    /* ignore */
  }

  function applyPanelCollapsed(collapsed: boolean): void {
    panelCollapsed = collapsed;
    bodyEl.style.display = collapsed ? "none" : "block";
    headerRow.style.marginBottom = collapsed ? "0" : "6px";
    collapseBtn.textContent = collapsed ? "▶" : "▼";
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    collapseBtn.setAttribute(
      "aria-label",
      collapsed ? "Expand panel" : "Collapse panel",
    );
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  applyPanelCollapsed(panelCollapsed);

  collapseBtn.addEventListener("click", () => {
    applyPanelCollapsed(!panelCollapsed);
  });

  container.appendChild(root);

  let namedPayload: NamedStarsPayload | null = null;
  let sortedNamed: NamedEntry[] = [];
  let currentOriginName = "Sol";
  const rayOrigin = new Vec3();
  const rayDir = new Vec3();
  const starPos = new Vec3();
  let pickedStar: NamedEntry | null = null;

  const solEntry: NamedEntry = {
    id: -1,
    name: "Sol",
    aliases: ["Sun"],
    x: 0,
    y: 0,
    z: 0,
    mag: -26.74,
    dist: 0,
    spect: "G2V",
  };

  function applyOrigin(star: NamedEntry): void {
    currentOriginName = star.name;
    originLine.textContent = `Origin: ${star.name}`;
    options.onOriginSet(star.x, star.y, star.z, star.name);
  }

  setOriginBtn.addEventListener("click", () => {
    if (pickedStar) applyOrigin(pickedStar);
  });

  function renderList(filter: string): void {
    const q = filter.trim().toLowerCase();
    let rows: NamedEntry[];
    if (!q) {
      rows = [solEntry, ...sortedNamed];
    } else {
      rows = sortedNamed.filter((s) => matchesNamedStarQuery(s, filter));
      if (matchesNamedStarQuery(solEntry, filter)) {
        rows = [solEntry, ...rows];
      }
    }

    const total = rows.length;
    const shown = rows.slice(0, LIST_MAX);
    listEl.replaceChildren();
    if (total === 0) {
      listHint.textContent = "No matches";
      return;
    }
    listHint.textContent =
      total > LIST_MAX
        ? `Showing ${LIST_MAX} of ${total.toLocaleString()} — type to narrow`
        : `${total.toLocaleString()} star${total === 1 ? "" : "s"}`;

    for (const s of shown) {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = s.name;
      row.title = `${s.name} — ${s.dist.toFixed(2)} pc · V ${s.mag.toFixed(2)}`;
      row.style.cssText = `
        display: block;
        width: 100%;
        text-align: left;
        padding: 6px 10px;
        border: none;
        border-bottom: 1px solid rgba(120,140,180,0.12);
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      `;
      row.addEventListener("mouseenter", () => {
        row.style.background = "rgba(80, 120, 200, 0.2)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", () => applyOrigin(s));
      listEl.appendChild(row);
    }
  }

  searchInput.addEventListener("input", () => {
    renderList(searchInput.value);
  });

  function setStarCount(n: number): void {
    starsLine.textContent = `Stars: ${n.toLocaleString()}`;
  }

  function setNamedData(data: NamedStarsPayload): void {
    namedPayload = data;

    const realSol = data.named.find((s) => s.name === "Sol");
    if (realSol) {
      solEntry.x = realSol.x;
      solEntry.y = realSol.y;
      solEntry.z = realSol.z;
    }

    sortedNamed = [...data.named].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    renderList(searchInput.value);
  }

  function tick(): void {
    const d = camera.position.length();
    if (d >= 1e6) {
      distLine.textContent = `Camera distance from ${currentOriginName}: ${(d / 1e6).toFixed(2)} Mpc`;
    } else if (d >= 1e3) {
      distLine.textContent = `Camera distance from ${currentOriginName}: ${(d / 1e3).toFixed(2)} kpc`;
    } else {
      distLine.textContent = `Camera distance from ${currentOriginName}: ${d.toFixed(1)} pc`;
    }
  }

  function clearPick(): void {
    pickedStar = null;
    pickBox.style.display = "none";
    pickText.textContent = "";
  }

  function pickNamedStar(
    canvasX: number,
    canvasY: number,
    width: number,
    height: number,
  ): void {
    if (!namedPayload?.named.length) return;

    const o = options.getOriginCatalog();

    const ndcX = (canvasX / width) * 2 - 1;
    const ndcY = -(canvasY / height) * 2 + 1;
    camera.updateMatrixWorld(true);
    rayOrigin.setFromMatrixPosition(camera.matrixWorld);
    const v = new Vec3(ndcX, ndcY, 0.5);
    v.unproject(camera);
    rayDir.copy(v).sub(rayOrigin).normalize();

    let best: (typeof namedPayload.named)[0] | null = null;
    let bestDist = Infinity;
    const threshold = Math.max(12, camera.position.length() * 0.002);

    for (const s of namedPayload.named) {
      starPos.set(s.x - o.x, s.y - o.y, s.z - o.z);
      const dist = distanceRayToPoint(rayOrigin, rayDir, starPos);
      if (dist < bestDist && dist < threshold) {
        bestDist = dist;
        best = s;
      }
    }

    if (best) {
      pickedStar = best;
      pickBox.style.display = "block";
      const spect = best.spect ? `\nSpectral type: ${best.spect}` : "";
      pickText.textContent = `${best.name}\nV magnitude: ${best.mag.toFixed(2)}\nDistance: ${best.dist.toFixed(2)} pc${spect}`;
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
