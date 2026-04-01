export function createLoadingOverlay(): {
  root: HTMLDivElement;
  setProgress: (loaded: number, total: number) => void;
  remove: () => void;
} {
  const root = document.createElement("div");
  root.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    padding: clamp(1.25rem, 4vw, 2.5rem);
    background: #020204;
    color: #c8d0e0;
    font-family: ui-sans-serif, system-ui, sans-serif;
    z-index: 1000;
    gap: 1rem;
  `;

  const title = document.createElement("div");
  title.textContent = "Loading AT-HYG star catalog…";
  title.style.fontSize = "clamp(1rem, 2.5vw, 1.25rem)";
  title.style.letterSpacing = "0.04em";

  const barWrap = document.createElement("div");
  barWrap.style.cssText = `
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: #1a1f2e;
    overflow: hidden;
  `;

  const bar = document.createElement("div");
  bar.style.cssText = `
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #3b6cff, #7aa8ff);
    transition: width 0.15s ease-out;
  `;
  barWrap.appendChild(bar);

  const status = document.createElement("div");
  status.style.fontSize = "clamp(0.8rem, 1.5vw, 0.95rem)";
  status.style.opacity = "0.75";
  status.textContent = "Starting download…";

  root.appendChild(title);
  root.appendChild(barWrap);
  root.appendChild(status);

  function setProgress(loaded: number, total: number): void {
    if (total > 0) {
      const pct = Math.min(100, Math.round((100 * loaded) / total));
      bar.style.width = `${pct}%`;
      status.textContent = `${(loaded / 1e6).toFixed(2)} / ${(total / 1e6).toFixed(2)} MB`;
    } else {
      bar.style.width = "45%";
      status.textContent = `${(loaded / 1e6).toFixed(2)} MB`;
    }
  }

  function remove(): void {
    root.remove();
  }

  return { root, setProgress, remove };
}
