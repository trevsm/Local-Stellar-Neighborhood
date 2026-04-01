import { defineConfig } from "vite";

/** Project Pages URL is /<repo>/; set automatically in GitHub Actions. */
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = repoName ? `/${repoName}/` : "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  assetsInclude: ["**/*.glsl"],
});
