import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// Swap `site` for the domain you register. It feeds the sitemap and canonical URLs.
export default defineConfig({
  site: 'https://flossify.ph',
  integrations: [sitemap()],
  // Static by default: the marketing pages, the sample sites and the patient
  // directory's shells prerender. Pages that read the database opt out with
  // `export const prerender = false` and render on the Node server.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  // Default is `_astro`; some static hosts reserve leading-underscore paths.
  build: { assets: 'assets' },
  vite: {
    plugins: [tailwindcss()],
  },
});
