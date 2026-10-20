import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo-name>/, so asset URLs need
// that prefix in production. Local dev stays at the root.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/jasmeet-3d-portfolio/' : '/',
});
