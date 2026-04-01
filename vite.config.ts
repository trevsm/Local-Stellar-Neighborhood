import { defineConfig } from "vite";

/**
 * GitHub Pages serves at https://<user>.github.io/<repo>/ — Vite `base` must match.
 * In CI, `GITHUB_REPOSITORY` is set to `owner/Local-Stellar-Neighborhood`.
 * Locally, default `/` keeps `npm run dev` correct; use `npm run preview:pages` to
 * build with the same base as production.
 */
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = repoName ? `/${repoName}/` : "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  assetsInclude: ["**/*.glsl"],
});
