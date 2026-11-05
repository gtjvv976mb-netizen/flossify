import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// Behind the host's HTTPS proxy the server itself sees plain http, and the
// proxy says the rest in X-Forwarded-Proto / X-Forwarded-Host. Astro trusts
// those only for the names listed here; without them every form post is
// refused as cross-site (measured: 403 on sign-in behind a proxy). Local
// names stay allowed so the preview on this machine keeps working.
// EXTRA_HOSTS (comma-separated, read when building) adds the platform's own
// address, e.g. flossify.onrender.com, for trying a deploy before DNS points
// flossify.ph at it.
const extraHosts = (process.env.EXTRA_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
const allowedDomains = [
  ...['flossify.ph', 'www.flossify.ph', ...extraHosts].map((hostname) => ({ hostname, protocol: 'https' })),
  { hostname: 'localhost' },
  { hostname: '127.0.0.1' },
];

// Left out of the sitemap: pages marked noindex (/app/, a clinic tablet's /f/t/), the worker's /offline/ page, the
// operator's /admin/, a step of a sign-in (the code pages, the unlock link), and pages that only send someone signed in
// on (/today/, /me/visits/). Every page listed answers 200 to a visitor with no cookie.
const UNLISTED = /^\/(app|offline|f\/t|admin(\/.*)?|auth\/(code|unlock)|me\/(code|visits)|today)\/$/;

// The live domain. It feeds the sitemap and canonical URLs.
export default defineConfig({
  site: 'https://flossify.ph',
  security: { allowedDomains },
  integrations: [sitemap({ filter: (p) => !UNLISTED.test(new URL(p).pathname) })],
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
